import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithToaster } from './testUtils';
import LostSharePage from '../pages/Lost/SharePage';
import LostWatchPage from '../pages/Lost/WatchPage';
import {
  endLostByElder,
  fetchLostSession,
  fetchMyLostStatus,
  LostApiError,
  markLostFound,
  uploadLostLocation,
} from '../api/lostApi';
import { GeolocationError, watchPositionUpdates, type GeoPosition } from '../utils/geolocation';
import type { LostSessionView } from '../types/lost';
import { lostMessages } from '../i18n/lostMessages';
import i18n from '../i18n';

vi.mock('../api/lostApi', async () => {
  const actual = await vi.importActual<typeof import('../api/lostApi')>('../api/lostApi');
  return {
    LostApiError: actual.LostApiError,
    fetchMyLostStatus: vi.fn(),
    uploadLostLocation: vi.fn(),
    endLostByElder: vi.fn(),
    fetchLostSession: vi.fn(),
    markLostFound: vi.fn(),
  };
});

// jsdom 沒有定位，也沒有 Leaflet 需要的版面：定位在工具函式這一層接管，地圖換成替身。
vi.mock('../utils/geolocation', async () => {
  const actual = await vi.importActual<typeof import('../utils/geolocation')>(
    '../utils/geolocation',
  );
  return { ...actual, watchPositionUpdates: vi.fn() };
});

vi.mock('../pages/Lost/LostMap', () => ({
  default: ({ label, trail }: { label: string; trail: unknown[] }) => (
    <div role="region" aria-label={label} data-trail-points={trail.length} />
  ),
}));

vi.mock('@line/liff', () => ({
  default: { isInClient: vi.fn(() => true), closeWindow: vi.fn() },
}));

const mockWatch = vi.mocked(watchPositionUpdates);

function renderAt(path: string, ui: React.ReactElement) {
  return renderWithToaster(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
}

/** 取得頁面交給 watchPositionUpdates 的兩個 callback，測試自己決定何時回報位置 */
function captureWatch() {
  const handlers: {
    onPosition?: (p: GeoPosition) => void;
    onError?: (e: GeolocationError) => void;
  } = {};
  const stop = vi.fn();
  mockWatch.mockImplementation((onPosition, onError) => {
    handlers.onPosition = onPosition;
    handlers.onError = onError;
    return stop;
  });
  return { handlers, stop };
}

const POSITION: GeoPosition = {
  latitude: 25.0339,
  longitude: 121.5645,
  accuracy: 18,
  timestamp: 0,
};

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('zh-TW');
});

describe('長輩定位頁', () => {
  it('沒有進行中的求救：不開始定位，告訴他怎麼求救', async () => {
    vi.mocked(fetchMyLostStatus).mockResolvedValue({
      active: false,
      status: null,
      started_at: null,
      ended_at: null,
    });

    renderAt('/lost/share', <LostSharePage />);

    expect(await screen.findByText(i18n.t('lost.share.inactiveTitle'))).toBeInTheDocument();
    expect(mockWatch).not.toHaveBeenCalled();
  });

  it('打開就開始定位，第一個位置立刻傳給家人', async () => {
    vi.mocked(fetchMyLostStatus).mockResolvedValue({
      active: true,
      status: 'active',
      started_at: '2026-09-16T08:00:00Z',
      ended_at: null,
    });
    vi.mocked(uploadLostLocation).mockResolvedValue({
      active: true,
      status: 'active',
      started_at: '2026-09-16T08:00:00Z',
      ended_at: null,
    });
    const { handlers } = captureWatch();

    renderAt('/lost/share', <LostSharePage />);

    expect(await screen.findByText(i18n.t('lost.share.title'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('lost.share.locating'))).toBeInTheDocument();

    act(() => handlers.onPosition?.(POSITION));

    await waitFor(() =>
      expect(uploadLostLocation).toHaveBeenCalledWith({
        latitude: 25.0339,
        longitude: 121.5645,
        accuracy: 18,
      }),
    );
    expect(
      await screen.findByText(i18n.t('lost.share.lastSent', { time: i18n.t('lost.time.justNow') })),
    ).toBeInTheDocument();
  });

  it('家人按了已找到：上傳回 active=false 就停止定位並告訴長輩', async () => {
    vi.mocked(fetchMyLostStatus).mockResolvedValue({
      active: true,
      status: 'active',
      started_at: '2026-09-16T08:00:00Z',
      ended_at: null,
    });
    vi.mocked(uploadLostLocation).mockResolvedValue({
      active: false,
      status: 'found',
      started_at: '2026-09-16T08:00:00Z',
      ended_at: '2026-09-16T08:30:00Z',
    });
    const { handlers, stop } = captureWatch();

    renderAt('/lost/share', <LostSharePage />);
    await screen.findByText(i18n.t('lost.share.title'));
    act(() => handlers.onPosition?.(POSITION));

    expect(await screen.findByText(i18n.t('lost.share.endedFound'))).toBeInTheDocument();
    expect(stop).toHaveBeenCalled();
  });

  it('沒允許定位：請他回聊天室按「傳送一次位置」', async () => {
    vi.mocked(fetchMyLostStatus).mockResolvedValue({
      active: true,
      status: 'active',
      started_at: '2026-09-16T08:00:00Z',
      ended_at: null,
    });
    const { handlers } = captureWatch();

    renderAt('/lost/share', <LostSharePage />);
    await screen.findByText(i18n.t('lost.share.title'));
    act(() => handlers.onError?.(new GeolocationError('permission_denied', 'denied')));

    expect(await screen.findByText(i18n.t('lost.share.permissionTitle'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('lost.share.permissionBody'))).toBeInTheDocument();
    expect(uploadLostLocation).not.toHaveBeenCalled();
  });

  it('按「我已經安全了」要先確認才結束', async () => {
    vi.mocked(fetchMyLostStatus).mockResolvedValue({
      active: true,
      status: 'active',
      started_at: '2026-09-16T08:00:00Z',
      ended_at: null,
    });
    vi.mocked(endLostByElder).mockResolvedValue({ ended: true, status: 'safe' });
    captureWatch();

    renderAt('/lost/share', <LostSharePage />);
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('lost.share.safeButton') }));
    expect(endLostByElder).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: i18n.t('lost.share.safeConfirm') }));

    expect(await screen.findByText(i18n.t('lost.share.endedSafe'))).toBeInTheDocument();
    expect(endLostByElder).toHaveBeenCalledTimes(1);
  });
});

function sessionView(overrides: Partial<LostSessionView> = {}): LostSessionView {
  const now = new Date().toISOString();
  return {
    session_id: 's1',
    status: 'active',
    intent: 'lost',
    patient_name: '林秀琴',
    patient_words: '我迷路了，旁邊有一間全聯',
    started_at: now,
    auto_end_at: new Date(Date.now() + 2 * 3_600_000).toISOString(),
    ended_at: null,
    ended_by_name: null,
    last_location: {
      latitude: 25.0339,
      longitude: 121.5645,
      accuracy: 23.6,
      source: 'liff',
      received_at: now,
    },
    last_seen_at: now,
    stale: false,
    stale_after_seconds: 180,
    trail: [
      { latitude: 25.033, longitude: 121.564, at: now },
      { latitude: 25.0339, longitude: 121.5645, at: now },
    ],
    server_time: now,
    ...overrides,
  };
}

describe('家人地圖頁', () => {
  it('顯示誰、說了什麼、地圖、最後更新與導航', async () => {
    vi.mocked(fetchLostSession).mockResolvedValue(sessionView());

    renderAt('/lost/watch?user=U_ELDER', <LostWatchPage />);

    expect(
      await screen.findByRole('heading', { name: i18n.t('lost.watch.title', { name: '林秀琴' }) }),
    ).toBeInTheDocument();
    expect(fetchLostSession).toHaveBeenCalledWith('U_ELDER');
    expect(screen.getByText('我迷路了，旁邊有一間全聯')).toBeInTheDocument();
    expect(screen.getByText(i18n.t('lost.watch.statusActive'))).toBeInTheDocument();
    const map = await screen.findByRole('region', {
      name: i18n.t('lost.watch.mapLabel', { name: '林秀琴' }),
    });
    expect(map).toHaveAttribute('data-trail-points', '2');
    expect(screen.getByText(i18n.t('lost.watch.accuracy', { meters: 24 }))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: i18n.t('lost.watch.navigate') })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=25.0339%2C121.5645',
    );
  });

  it('還沒收到位置：顯示正在等，不顯示地圖', async () => {
    vi.mocked(fetchLostSession).mockResolvedValue(
      sessionView({ last_location: null, last_seen_at: null, trail: [] }),
    );

    renderAt('/lost/watch?user=U_ELDER', <LostWatchPage />);

    expect(
      await screen.findByText(i18n.t('lost.watch.waiting', { name: '林秀琴' })),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: i18n.t('lost.watch.mapLabel', { name: '林秀琴' }) }),
    ).not.toBeInTheDocument();
  });

  it('位置超過門檻沒更新：標示停止更新，並給撥打 110', async () => {
    const old = new Date(Date.now() - 5 * 60_000).toISOString();
    vi.mocked(fetchLostSession).mockResolvedValue(
      sessionView({
        last_seen_at: old,
        last_location: { ...sessionView().last_location!, received_at: old },
      }),
    );

    renderAt('/lost/watch?user=U_ELDER', <LostWatchPage />);

    expect(await screen.findByText(i18n.t('lost.watch.statusStale'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('lost.watch.staleHint'))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: i18n.t('lost.watch.call110') })).toHaveAttribute(
      'href',
      'tel:110',
    );
  });

  it('按已找到要確認，送出後重新讀取狀態', async () => {
    vi.mocked(fetchLostSession)
      .mockResolvedValueOnce(sessionView())
      .mockResolvedValue(sessionView({ status: 'found', ended_by_name: '陳志明' }));
    vi.mocked(markLostFound).mockResolvedValue({ ended: true, status: 'found' });

    renderAt('/lost/watch?user=U_ELDER', <LostWatchPage />);
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('lost.watch.foundButton') }));
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('lost.watch.foundConfirm') }));

    expect(
      await screen.findByText(
        i18n.t('lost.watch.endedFound', { finder: '陳志明', name: '林秀琴' }),
      ),
    ).toBeInTheDocument();
    expect(markLostFound).toHaveBeenCalledWith('U_ELDER');
    expect(
      screen.queryByRole('button', { name: i18n.t('lost.watch.foundButton') }),
    ).not.toBeInTheDocument();
  });

  it('沒有權限：說清楚，不重試', async () => {
    vi.mocked(fetchLostSession).mockRejectedValue(new LostApiError(403));

    renderAt('/lost/watch?user=U_ELDER', <LostWatchPage />);

    expect(await screen.findByText(i18n.t('lost.watch.forbidden'))).toBeInTheDocument();
    expect(fetchLostSession).toHaveBeenCalledTimes(1);
  });

  it('連結少了對象：不打 API', async () => {
    renderAt('/lost/watch', <LostWatchPage />);

    expect(await screen.findByText(i18n.t('lost.watch.missingUser'))).toBeInTheDocument();
    expect(fetchLostSession).not.toHaveBeenCalled();
  });
});

describe('走失求救文案', () => {
  const zhKeys = Object.keys(lostMessages['zh-TW']);

  it('六種語言的 key 完全一致', () => {
    for (const lang of Object.keys(lostMessages) as (keyof typeof lostMessages)[]) {
      expect(Object.keys(lostMessages[lang]).sort(), lang).toEqual([...zhKeys].sort());
    }
  });

  it('佔位符與中文一致', () => {
    const placeholders = (text: string) => (text.match(/{{\w+}}/g) ?? []).sort();
    for (const lang of Object.keys(lostMessages) as (keyof typeof lostMessages)[]) {
      for (const key of zhKeys) {
        expect(placeholders(lostMessages[lang][key]), `${lang} / ${key}`).toEqual(
          placeholders(lostMessages['zh-TW'][key]),
        );
      }
    }
  });

  it('非中日文語言沒有漏譯成中文', () => {
    for (const lang of ['en', 'id', 'vi', 'th'] as const) {
      for (const key of zhKeys) {
        expect(/[一-龥]/.test(lostMessages[lang][key]), `${lang} / ${key}`).toBe(false);
      }
    }
  });
});

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithToaster } from './testUtils';
import AdminRoute from '../components/AdminRoute';
import AdminAnnotationsPage from '../pages/AdminAnnotations';
import * as api from '../api/annotationsApi';
import * as profileApi from '../api/profileApi';
import type { AnnotationSession } from '../api/annotationsApi';

vi.mock('../api/annotationsApi', async original => ({
  ...(await original<typeof api>()),
  fetchAnnotationTasks: vi.fn(), fetchAnnotationSession: vi.fn(), saveAnnotation: vi.fn(), exportAnnotations: vi.fn(),
}));
vi.mock('../api/profileApi', () => ({ getPersonalHealthProfile: vi.fn() }));

function session(): AnnotationSession {
  return {
    task: 'health', title: '健康相關標註', annotator: '登入的同學', annotator_id: '12345678',
    fingerprint: 'a'.repeat(64), version: 'health-annotator-1', hash_key: 'samples_sha256', pilot: 100,
    items: [{ id: 'one', t: '第一則訊息' }, { id: 'two', t: '第二則訊息' }],
    order: [{ id: 'one', retest: false }, { id: 'two', retest: false }],
    started_at: '2026-10-29T00:00:00Z', revision: 0, position: 0, answers: {},
  };
}

function renderPage() {
  return renderWithToaster(<MemoryRouter><AdminRoute><AdminAnnotationsPage /></AdminRoute></MemoryRouter>);
}

async function start() {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: '開始／繼續健康相關標註' }));
  await screen.findByText('第一則訊息');
}

async function writeNote(value: string) {
  fireEvent.click(screen.getByRole('button', { name: '補充備註' }));
  fireEvent.change(await screen.findByLabelText('備註（選填）'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: '回到卡片' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}

function swipe(x: number, y = 0, zone = false) {
  const card = screen.getByRole('group', { name: '標註卡片' });
  const target = zone ? screen.getByLabelText('滑動區：左滑無關、右滑健康相關、上滑無法判斷') : card;
  const pointer = { pointerId: 1, isPrimary: true, pointerType: 'touch', button: 0 };
  fireEvent.pointerDown(target, { ...pointer, clientX: 200, clientY: 300 });
  fireEvent.pointerMove(card, { ...pointer, clientX: 200 + x, clientY: 300 + y });
  fireEvent.pointerUp(card, { ...pointer, clientX: 200 + x, clientY: 300 + y });
}

describe('管理員標記頁面', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue({ role: 'admin', name: '登入的同學' });
    vi.mocked(api.fetchAnnotationTasks).mockResolvedValue([{ id: 'health', title: '健康相關標註', description: '判斷是否與健康相關', question_count: 2, total_count: 2 }]);
    vi.mocked(api.fetchAnnotationSession).mockResolvedValue(session());
    vi.mocked(api.saveAnnotation).mockResolvedValue({ revision: 1, position: 1, answer: {
      id: 'one', retest: false, label: 1, unsure: false, note: '', ms: 10, at: 'now', edits: 0,
    } });
  });

  it('非 admin 連題組都不會讀取', async () => {
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue({ role: 'user' });
    renderPage();
    await waitFor(() => expect(screen.queryByText('確認權限中…')).not.toBeInTheDocument());
    expect(api.fetchAnnotationTasks).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: '標記頁面' })).not.toBeInTheDocument();
  });

  it('沿用帳號姓名，儲存成功才換題，且不把姓名送回後端', async () => {
    await start();
    fireEvent.click(screen.getByRole('button', { name: '更多選項' }));
    expect(await screen.findByText(/標註者：登入的同學/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '關閉' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByPlaceholderText(/你的名字/)).not.toBeInTheDocument();
    await writeNote('我的理由');
    fireEvent.click(screen.getByRole('button', { name: '健康相關（J）' }));
    await screen.findByText('第二則訊息');
    expect(api.saveAnnotation).toHaveBeenCalledWith('health', 0, expect.objectContaining({ revision: 0, label: 1, note: '我的理由' }));
    expect(vi.mocked(api.saveAnnotation).mock.calls[0][2]).not.toHaveProperty('annotator');
  });

  it('儲存失敗會留在本題並保留備註，可重新送出', async () => {
    vi.mocked(api.saveAnnotation).mockRejectedValueOnce(new Error('連線暫時中斷'));
    await start();
    await writeNote('保留的理由');
    fireEvent.click(screen.getByRole('button', { name: '健康相關（J）' }));
    await screen.findByText('連線暫時中斷');
    expect(screen.getByText('第一則訊息')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '健康相關（J）' }));
    await screen.findByText('第二則訊息');
    expect(vi.mocked(api.saveAnnotation).mock.calls[1][2].note).toBe('保留的理由');
  });

  it('過期視窗不能繼續覆蓋答案，提供重新載入', async () => {
    vi.mocked(api.saveAnnotation).mockRejectedValueOnce(new api.AnnotationApiError('其他視窗已更新進度', 409));
    await start();
    fireEvent.click(screen.getByRole('button', { name: '健康相關（J）' }));
    await screen.findByText('其他視窗已更新進度');
    expect(screen.getByRole('button', { name: '健康相關（J）' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '重新載入進度' })).toBeInTheDocument();
  });

  it('重新進入時從伺服器保存的位置繼續', async () => {
    vi.mocked(api.fetchAnnotationSession).mockResolvedValue({ ...session(), position: 1, revision: 1 });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '開始／繼續健康相關標註' }));
    await screen.findByText('第二則訊息');
    expect(screen.queryByText('第一則訊息')).not.toBeInTheDocument();
  });

  it('主張配對呈現兩段文字並沿用同一帳號儲存', async () => {
    vi.mocked(api.fetchAnnotationTasks).mockResolvedValue([{ id: 'claim-pairs', title: '主張配對標註', description: '比對核心宣稱', question_count: 1, total_count: 1 }]);
    vi.mocked(api.fetchAnnotationSession).mockResolvedValue({
      ...session(), task: 'claim-pairs', title: '主張配對標註',
      hash_key: 'dataset_sha256', version: 'claim-annotator-1',
      items: [{ id: 0, u: '使用者的傳言', r: '報告查核的傳言' }],
      order: [{ id: 0, retest: false }],
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '開始／繼續主張配對標註' }));
    await screen.findByText('使用者的傳言');
    expect(screen.getByText('報告查核的傳言')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '無法判斷（N）' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '同一主張（J）' }));
    await screen.findByText('標完了，謝謝！');
    expect(api.saveAnnotation).toHaveBeenCalledWith('claim-pairs', 0, expect.objectContaining({ label: 1 }));
  });

  it('左右滑卡片會送出對應答案', async () => {
    await start();
    swipe(120);
    await screen.findByText('第二則訊息');
    expect(api.saveAnnotation).toHaveBeenCalledWith('health', 0, expect.objectContaining({ label: 1 }));
  });

  it('短距離拖動與內文直向捲動不會誤標', async () => {
    await start();
    swipe(25);
    swipe(4, -140);
    expect(api.saveAnnotation).not.toHaveBeenCalled();
    expect(screen.getByText('第一則訊息')).toBeInTheDocument();
  });

  it('健康分類從底部上滑才標成無法判斷', async () => {
    await start();
    swipe(0, -120, true);
    await screen.findByText('第二則訊息');
    expect(api.saveAnnotation).toHaveBeenCalledWith('health', 0, expect.objectContaining({ label: null }));
  });

  it('滑動儲存失敗留在原卡片，重滑可以重試', async () => {
    vi.mocked(api.saveAnnotation).mockRejectedValueOnce(new Error('連線暫時中斷'));
    await start();
    swipe(-120);
    await screen.findByText('連線暫時中斷');
    expect(screen.getByText('第一則訊息')).toBeInTheDocument();
    swipe(-120);
    await screen.findByText('第二則訊息');
    expect(api.saveAnnotation).toHaveBeenCalledTimes(2);
  });

  it('儲存尚未完成時，重複滑動不會多送或跳題', async () => {
    let resolveSave!: (result: Awaited<ReturnType<typeof api.saveAnnotation>>) => void;
    vi.mocked(api.saveAnnotation).mockReturnValueOnce(new Promise(resolve => { resolveSave = resolve; }));
    await start();
    swipe(120);
    swipe(120);
    expect(api.saveAnnotation).toHaveBeenCalledTimes(1);
    expect(screen.getByText('第一則訊息')).toBeInTheDocument();
    resolveSave({ revision: 1, position: 1, answer: {
      id: 'one', retest: false, label: 1, unsure: false, note: '', ms: 10, at: 'now', edits: 0,
    } });
    await screen.findByText('第二則訊息');
  });

  it('匯出與長說明預設隱藏，更多選單說明不需匯出', async () => {
    await start();
    expect(screen.queryByRole('button', { name: '匯出 JSON' })).not.toBeInTheDocument();
    expect(screen.queryByText('判斷規則與例子')).not.toBeInTheDocument();
    expect(screen.queryByText(/直接使用登入帳號/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '更多選項' }));
    expect(await screen.findByRole('button', { name: '匯出 JSON' })).toBeInTheDocument();
    expect(screen.getByText(/答案已自動儲存，不需匯出/)).toBeInTheDocument();
  });
});

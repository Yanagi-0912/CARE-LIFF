import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithToaster } from './testUtils';
import NearbyHospitalsPage from '../pages/NearbyHospitals';
import { fetchNearbyHospitals, searchFacilitiesByName } from '../api/medicalApi';
import type {
  FacilitySearchResponse,
  MedicalFacility,
  NearbyHospitalsResponse,
} from '../types/medical';
import i18n from '../i18n';

vi.mock('../api/medicalApi', () => ({
  fetchNearbyHospitals: vi.fn(),
  searchFacilitiesByName: vi.fn(),
}));

// 定位權限在 jsdom 裡拿不到，改在 hook 這一層給一個固定座標。
const mockRequestPosition = vi.fn();
vi.mock('../hooks/useGeolocation', () => ({
  useGeolocation: () => ({
    position: { latitude: 25.04, longitude: 121.51, accuracy: 12 },
    loading: false,
    errorCode: null,
    errorMessage: null,
    requestPosition: mockRequestPosition,
    clearError: vi.fn(),
  }),
}));

const mockFetchNearby = vi.mocked(fetchNearbyHospitals);
const mockSearchByName = vi.mocked(searchFacilitiesByName);

function makeFacility(overrides: Partial<MedicalFacility> = {}): MedicalFacility {
  return {
    id: 'f1',
    name: '仁愛醫院',
    latitude: 25.0378,
    longitude: 121.5568,
    address: '臺北市大安區仁愛路四段 10 號',
    phone: '(02) 2709-3600',
    type: '醫院',
    distance_meters: 820,
    clinic_time: null,
    departments: ['內科', '急診醫學科'],
    notes: null,
    business_status: {
      status: 'break',
      next_open: { weekday_key: 'monday', time_text: '14:00', is_today: true },
      note: null,
      has_emergency: true,
    },
    ...overrides,
  };
}

function makeNearbyResponse(
  overrides: Partial<NearbyHospitalsResponse> = {},
): NearbyHospitalsResponse {
  const facilities = overrides.facilities ?? [makeFacility()];
  return {
    facilities,
    count: facilities.length,
    reached_meters: 5000,
    satisfied: true,
    expanded: false,
    furthest_meters: 820,
    max_meters: 50000,
    open_now_requested: false,
    open_now_fallback: false,
    department: null,
    facility_type: null,
    unresolved_department: null,
    unresolved_facility_type: null,
    pharmacy_data_gap_meters: null,
    ...overrides,
  };
}

function makeNameResponse(
  overrides: Partial<FacilitySearchResponse> = {},
): FacilitySearchResponse {
  const facilities = overrides.facilities ?? [makeFacility({ name: '臺大醫院' })];
  return { facilities, count: facilities.length, total_count: facilities.length, ...overrides };
}

describe('附近醫院頁', () => {
  beforeEach(async () => {
    mockFetchNearby.mockReset();
    mockSearchByName.mockReset();
    mockRequestPosition.mockReset();
    mockRequestPosition.mockResolvedValue({
      latitude: 25.04,
      longitude: 121.51,
      accuracy: 12,
    });
    await i18n.changeLanguage('zh-TW');
  });

  const renderPage = () => renderWithToaster(<NearbyHospitalsPage />);

  it('不帶任何條件時只送座標，不再寫死搜尋半徑', async () => {
    // radius_meters 寫死 5 公里曾讓後端的階梯放寬完全失效，
    // 醫療資源密度低的地區永遠只會看到「附近無資料」。
    mockFetchNearby.mockResolvedValue(makeNearbyResponse());
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '取得位置並搜尋' }));

    await waitFor(() => expect(mockFetchNearby).toHaveBeenCalled());
    expect(mockFetchNearby).toHaveBeenCalledWith(25.04, 121.51, {
      openNow: false,
      department: '',
      facilityType: '',
    });
  });

  it('選了類型、科別與營業中，三個條件都要送到後端', async () => {
    mockFetchNearby.mockResolvedValue(makeNearbyResponse());
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '醫院' }));
    fireEvent.click(screen.getByRole('button', { name: '牙科' }));
    fireEvent.click(screen.getByRole('switch', { name: '只看現在營業中' }));
    fireEvent.click(screen.getByRole('button', { name: '取得位置並搜尋' }));

    await waitFor(() => expect(mockFetchNearby).toHaveBeenCalled());
    expect(mockFetchNearby).toHaveBeenCalledWith(25.04, 121.51, {
      openNow: true,
      department: '牙科',
      facilityType: '醫院',
    });
  });

  it('科別可自由輸入，不受快捷鍵清單限制', async () => {
    mockFetchNearby.mockResolvedValue(makeNearbyResponse());
    renderPage();

    fireEvent.change(screen.getByLabelText('診療科別'), {
      target: { value: '腸胃科' },
    });
    fireEvent.click(screen.getByRole('button', { name: '取得位置並搜尋' }));

    await waitFor(() => expect(mockFetchNearby).toHaveBeenCalled());
    expect(mockFetchNearby.mock.calls[0][2]).toMatchObject({ department: '腸胃科' });
  });

  it('名稱查詢真的會把使用者打的字送出去', async () => {
    // 這是本次修的回歸：舊版的搜尋框有輸入欄位，但 onSubmitSearch 把 query 丟掉，
    // 使用者打「臺大醫院」按下去，拿到的是附近五家不相干的診所。
    mockSearchByName.mockResolvedValue(makeNameResponse());
    renderPage();

    fireEvent.click(screen.getByRole('tab', { name: '找名稱' }));
    fireEvent.change(screen.getByLabelText('院所名稱'), {
      target: { value: '臺大醫院' },
    });
    fireEvent.click(screen.getByRole('button', { name: '查詢' }));

    await waitFor(() => expect(mockSearchByName).toHaveBeenCalled());
    expect(mockSearchByName).toHaveBeenCalledWith('臺大醫院', {
      lat: 25.04,
      lng: 121.51,
    });
    expect(await screen.findByText('臺大醫院')).toBeInTheDocument();
  });

  it('名稱空白時不發出請求，直接提示', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('tab', { name: '找名稱' }));
    fireEvent.click(screen.getByRole('button', { name: '查詢' }));

    expect(await screen.findByText('請先輸入院所名稱')).toBeInTheDocument();
    expect(mockSearchByName).not.toHaveBeenCalled();
  });

  it('卡片顯示營業狀態、下次開診與急診標示', async () => {
    mockFetchNearby.mockResolvedValue(makeNearbyResponse());
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '取得位置並搜尋' }));

    expect(await screen.findByText('午休中')).toBeInTheDocument();
    expect(screen.getByText('今日 14:00 開診')).toBeInTheDocument();
    // 設有急診是能力標示，不該壓掉「午休中」——兩者必須同時看得到。
    expect(screen.getByText('設有急診')).toBeInTheDocument();
  });

  it('導航連結用座標而非地址字串', async () => {
    mockFetchNearby.mockResolvedValue(makeNearbyResponse());
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '取得位置並搜尋' }));

    const link = await screen.findByRole('link', { name: '導航前往' });
    expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=25.0378%2C121.5568&travelmode=driving',
    );
  });

  it('擴大範圍時要說明實際搜到多遠', async () => {
    mockFetchNearby.mockResolvedValue(
      makeNearbyResponse({ expanded: true, reached_meters: 20000, furthest_meters: 12300 }),
    );
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '取得位置並搜尋' }));

    expect(
      await screen.findByText(/擴大範圍，共 1 間，最遠約 13 公里/),
    ).toBeInTheDocument();
  });

  it('科別看不懂時要說「不確定是哪一科」，而不是「附近沒有」', async () => {
    mockFetchNearby.mockResolvedValue(
      makeNearbyResponse({ facilities: [], count: 0, unresolved_department: '宇宙科' }),
    );
    renderPage();

    fireEvent.change(screen.getByLabelText('診療科別'), {
      target: { value: '宇宙科' },
    });
    fireEvent.click(screen.getByRole('button', { name: '取得位置並搜尋' }));

    expect(await screen.findByText(/不確定「宇宙科」對應到哪一個診療科別/)).toBeInTheDocument();
  });

  it('查詢失敗時顯示錯誤，不留下上一次的結果', async () => {
    mockFetchNearby.mockResolvedValue(makeNearbyResponse());
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '取得位置並搜尋' }));
    expect(await screen.findByText('仁愛醫院')).toBeInTheDocument();

    mockFetchNearby.mockRejectedValue(new Error('醫療院所查詢暫時不可用，請稍後再試'));
    fireEvent.click(screen.getByRole('button', { name: '取得位置並搜尋' }));

    expect(
      await screen.findByText('醫療院所查詢暫時不可用，請稍後再試'),
    ).toBeInTheDocument();
    expect(screen.queryByText('仁愛醫院')).not.toBeInTheDocument();
  });
});

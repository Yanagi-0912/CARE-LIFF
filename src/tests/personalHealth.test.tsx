import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import liff from '@line/liff';

// 1. 匯入整包 API 物件，方便後面使用 vi.mocked 存取
import * as api from '../api/profileApi';
import PersonalHealthPage from '../pages/PersonalHealth/index.tsx';

// 2. 直接在 mock 內部定義 mock 函式
vi.mock('../api/profileApi', () => ({
    getPersonalHealthProfile: vi.fn(),
    upsertPersonalHealthProfile: vi.fn(),
}));

// Mock 外部的 liff 模組
vi.mock('@line/liff', () => ({
    default: {
        init: vi.fn(() => Promise.resolve()),
        getProfile: vi.fn(() => Promise.resolve({ displayName: 'LINE User', pictureUrl: 'https://line.me/avatar.png' })),
        isLoggedIn: vi.fn(() => true),
    },
}));
//避免測試中因 useNavigate 導致錯誤，直接 mock 掉 useNavigate
vi.mock('react-router-dom', () => ({
    ...vi.importActual('react-router-dom'),
    useNavigate: () => vi.fn(), // 讓 useNavigate 直接回傳一個假的空函式
}));
// ==========================================
// 共用 Mock Helper：統一設定 API 的預設回傳值
// ==========================================
type ApiMockOverrides = {
    getPersonalHealthProfile?: ReturnType<typeof vi.fn>;
    upsertPersonalHealthProfile?: ReturnType<typeof vi.fn>;
};

function setupApiMocks(overrides: ApiMockOverrides = {}) {
    // 預設：載入時沒有既有資料 (回傳 null 或空)
    vi.mocked(api.getPersonalHealthProfile).mockResolvedValue(null);
    vi.mocked(api.upsertPersonalHealthProfile).mockResolvedValue({ success: true });

    // 套用個別測試想要的 override
    if (overrides.getPersonalHealthProfile) {
        vi.mocked(api.getPersonalHealthProfile).mockImplementation(overrides.getPersonalHealthProfile as any);
    }
    if (overrides.upsertPersonalHealthProfile) {
        vi.mocked(api.upsertPersonalHealthProfile).mockImplementation(overrides.upsertPersonalHealthProfile as any);
    }
}

describe('PersonalHealthPage 核心表單邏輯測試', () => {
    beforeEach(() => {
        localStorage.clear();

        // 3. 使用 vi.mocked 幫 API 函式與 SDK 重置紀錄
        vi.mocked(api.getPersonalHealthProfile).mockReset();
        vi.mocked(api.upsertPersonalHealthProfile).mockReset();
        vi.mocked(liff.init).mockReset();
        vi.mocked(liff.getProfile).mockReset();
        vi.mocked(liff.isLoggedIn).mockReset();
    });

    // 快速填寫基本必填欄位 (排除性別)
    const fillRequiredFieldsExceptGender = () => {
        fireEvent.change(screen.getByLabelText('姓名'), { target: { value: '張小明' } });
        fireEvent.change(screen.getByLabelText('身高 (cm)'), { target: { value: '175' } });
        fireEvent.change(screen.getByLabelText('體重 (kg)'), { target: { value: '70' } });
        fireEvent.change(screen.getByLabelText('年齡'), { target: { value: '30' } });
    };

    // ==========================================
    // 案例 1：性別必填檢查
    // ==========================================
    it('不選性別直接送出 → 顯示「請先選擇性別」且不呼叫 upsertPersonalHealthProfile', async () => {
        setupApiMocks();
        render(<PersonalHealthPage />);

        // 等待 LIFF 與資料載入完成
        await waitFor(() => expect(screen.getByLabelText('姓名')).toHaveValue('LINE User'));

        // 填寫其他必填欄位，唯獨漏掉性別
        fireEvent.change(screen.getByLabelText('身高 (cm)'), { target: { value: '175' } });
        fireEvent.change(screen.getByLabelText('體重 (kg)'), { target: { value: '70' } });
        fireEvent.change(screen.getByLabelText('年齡'), { target: { value: '30' } });

        // 點擊儲存
        const saveButton = screen.getByRole('button', { name: '儲存紀錄' });
        fireEvent.click(saveButton);

        // 驗證錯誤 Toast 提示
        expect(await screen.findByText('請先選擇性別')).toBeInTheDocument();
        // 驗證後端 API 從未被呼叫過
        expect(api.upsertPersonalHealthProfile).not.toHaveBeenCalled();
    });

    // ==========================================
    // 案例 2：數值範圍驗證
    // ==========================================
    it('案例 2：當輸入無效的數值（年齡、身高、體重超出範圍）時，應攔截並顯示錯誤提示', async () => {
        setupApiMocks();
        render(<PersonalHealthPage />);

        // 1. 填入不合法的資料
        const ageInput = screen.getByPlaceholderText('請輸入年齡');
        const heightInput = screen.getByPlaceholderText('請輸入身高');
        const weightInput = screen.getByPlaceholderText('請輸入體重');

        fireEvent.change(ageInput, { target: { value: '150' } });    // 超出上限 130
        fireEvent.change(heightInput, { target: { value: '20' } });    // 低於下限 30
        fireEvent.change(weightInput, { target: { value: '600' } });   // 超出上限 500

        // 先選擇性別以避免觸發性別必填檢查
        const genderButton = screen.getByRole('button', { name: /請選擇性別/i });
        fireEvent.click(genderButton);
        const maleOption = await screen.findByRole('button', { name: '男' });
        fireEvent.click(maleOption);
        // 2. 觸發表單提交
        const submitButton = screen.getByRole('button', { name: '儲存紀錄' });
        fireEvent.click(submitButton);
        // 3. 驗證錯誤提示是否正確顯示
        expect(await screen.findByText((content) => content.includes('年齡') && content.includes('130'))).toBeInTheDocument();
        expect(screen.getByText((content) => content.includes('身高') && content.includes('300'))).toBeInTheDocument();
        expect(screen.getByText((content) => content.includes('體重') && content.includes('500'))).toBeInTheDocument();
        // 4. 驗證畫面的主要 Toast 錯誤提示
        expect(screen.getByText('欄位輸入有誤，請檢查下方提示')).toBeInTheDocument();
        // 5. 確保後端 API 絕對沒有被呼叫
        expect(api.upsertPersonalHealthProfile).not.toHaveBeenCalled();
    });

    // ==========================================
    // 案例 3：慢性病史組合邏輯 - 勾選一般選項
    // ==========================================
    it('勾選一般選項（高血壓、糖尿病）直接送出 → payload 的 chronic_history 正確 join', async () => {
        const upsertMock = vi.fn().mockResolvedValue({ success: true });
        setupApiMocks({ upsertPersonalHealthProfile: upsertMock });
        render(<PersonalHealthPage />);
        await screen.findByLabelText('姓名');

        // 填寫基本資料與選擇性別
        fillRequiredFieldsExceptGender();
        fireEvent.click(screen.getByRole('button', { name: /請選擇性別/ }));
        fireEvent.click(screen.getByRole('button', { name: '男' }));

        // 開啟慢性病選單並勾選「高血壓」與「糖尿病」
        fireEvent.click(screen.getByRole('button', { name: /請選擇慢性病史/ }));
        fireEvent.click(screen.getByRole('button', { name: /✓\s*高血壓|高血壓/ }));
        fireEvent.click(screen.getByRole('button', { name: /✓\s*糖尿病|糖尿病/ }));

        // 送出表單
        fireEvent.click(screen.getByRole('button', { name: '儲存紀錄' }));

        await waitFor(() => {
            expect(upsertMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    chronic_history: '高血壓、糖尿病',
                    height: 175,  // 驗證有轉型為 Number
                    weight: 70,
                    age: 30,
                })
            );
        });
        expect(await screen.findByText('已成功儲存個人健康資料')).toBeInTheDocument();
    });

    // ==========================================
    // 案例 4：慢性病史組合邏輯 - 勾選「其他」並填寫內容
    // ==========================================
    it('勾選「其他」並填寫內容 → 送出後包含該自訂文字', async () => {
        const upsertMock = vi.fn().mockResolvedValue({ success: true });
        setupApiMocks({ upsertPersonalHealthProfile: upsertMock });
        render(<PersonalHealthPage />);
        await screen.findByLabelText('姓名');

        fillRequiredFieldsExceptGender();
        fireEvent.click(screen.getByRole('button', { name: /請選擇性別/ }));
        fireEvent.click(screen.getByRole('button', { name: '女' }));

        // 勾選一般項目「氣喘」與「其他」
        fireEvent.click(screen.getByRole('button', { name: /請選擇慢性病史/ }));
        fireEvent.click(screen.getByRole('button', { name: /✓\s*氣喘|氣喘/ }));
        fireEvent.click(screen.getByRole('button', { name: /✓\s*其他|其他/ }));

        // 填寫自訂內容並點擊打勾保存
        const otherTextInput = screen.getByPlaceholderText('請輸入其他慢性病');
        fireEvent.change(otherTextInput, { target: { value: '胃食道逆流' } });
        fireEvent.click(screen.getByRole('button', { name: '儲存其他慢性病' }));
        expect(screen.getByText('已儲存')).toBeInTheDocument();

        // 送出表單
        fireEvent.click(screen.getByRole('button', { name: '儲存紀錄' }));

        await waitFor(() => {
            expect(upsertMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    chronic_history: '氣喘、胃食道逆流'
                })
            );
        });
    });

    // ==========================================
    // 案例 5：慢性病史組合邏輯 - 勾選「其他」但沒填內容
    // ==========================================
    it('勾選「其他」但沒填內容，也沒勾其他項目 → fallback 存成 "無"', async () => {
        const upsertMock = vi.fn().mockResolvedValue({ success: true });
        setupApiMocks({ upsertPersonalHealthProfile: upsertMock });
        render(<PersonalHealthPage />);
        await screen.findByLabelText('姓名');

        fillRequiredFieldsExceptGender();
        fireEvent.click(screen.getByRole('button', { name: /請選擇性別/ }));
        fireEvent.click(screen.getByRole('button', { name: '男' }));

        // 只勾選「其他」，但不填寫文字輸入框
        fireEvent.click(screen.getByRole('button', { name: /請選擇慢性病史/ }));
        fireEvent.click(screen.getByRole('button', { name: /✓\s*其他|其他/ }));

        // 送出表單
        fireEvent.click(screen.getByRole('button', { name: '儲存紀錄' }));

        await waitFor(() => {
            expect(upsertMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    chronic_history: '無'
                })
            );
        });
    });

    // ==========================================
    // 案例 7：載入既有資料回填表單
    // ==========================================
    // ==========================================
    // 正確的案例 7：姓名優先順序驗證
    // ==========================================
    describe('案例 7：姓名優先順序驗證', () => {
        it('A. 當資料庫有姓名時 → 應以資料庫姓名為主，不被 LIFF 的 displayName 覆蓋', async () => {
            // 模擬資料庫已有姓名 "王大錘"
            setupApiMocks({
                getPersonalHealthProfile: vi.fn().mockResolvedValue({
                    name: '王大錘',
                    gender: '男',
                    height: 180,
                    weight: 75,
                    age: 25,
                    chronic_history: '無'
                })
            });

            // 模擬 LIFF 回傳名稱為 "LINE User"
            vi.mocked(liff.getProfile).mockResolvedValue({
                displayName: 'LINE User',
                pictureUrl: 'https://line.me/avatar.png'
            });

            render(<PersonalHealthPage />);

            // 驗證輸入框與標題最終顯示的是資料庫的 "王大錘"
            const nameInput = await screen.findByLabelText('姓名');
            expect(nameInput).toHaveValue('王大錘');
            expect(screen.getByText('王大錘 的健康資料')).toBeInTheDocument();
        });

        it('B. 當資料庫沒有姓名時 → 應 fallback 使用 LIFF 的 displayName', async () => {
            // 模擬資料庫回傳 null 或沒有 name 欄位
            setupApiMocks({
                getPersonalHealthProfile: vi.fn().mockResolvedValue(null)
            });

            // 模擬 LIFF 回傳名稱為 "LINE User"
            vi.mocked(liff.getProfile).mockResolvedValue({
                displayName: 'LINE User',
                pictureUrl: 'https://line.me/avatar.png'
            });

            render(<PersonalHealthPage />);

            // 驗證輸入框與標題最終後退一步（fallback）採用 LIFF 的 "LINE User"
            const nameInput = await screen.findByLabelText('姓名');
            expect(nameInput).toHaveValue('LINE User');
            expect(screen.getByText('LINE User 的健康資料')).toBeInTheDocument();
        });
    });
});
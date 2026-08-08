import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithToaster } from './testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import liff from '@line/liff';

// 1. 匯入整包 API 物件，方便後面使用 vi.mocked 存取
import * as api from '../api/profileApi';
import type { HealthProfile } from '../api/profileApi';
import PersonalHealthPage from '../pages/PersonalHealth/index.tsx';
import i18n from '../i18n';

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
function setupApiMocks(profile: HealthProfile | null = null) {
    vi.mocked(api.getPersonalHealthProfile).mockResolvedValue(profile);
    vi.mocked(api.upsertPersonalHealthProfile).mockResolvedValue({ success: true });
    vi.mocked(liff.init).mockResolvedValue(undefined);
    vi.mocked(liff.getProfile).mockResolvedValue({
        displayName: 'LINE User',
        pictureUrl: 'https://line.me/avatar.png',
    });
    vi.mocked(liff.isLoggedIn).mockReturnValue(true);
}

describe('PersonalHealthPage 核心表單邏輯測試', () => {
    beforeEach(async () => {
        localStorage.clear();
        await i18n.changeLanguage('zh-TW');

        // 3. 使用 vi.mocked 幫 API 函式與 SDK 重置紀錄
        vi.mocked(api.getPersonalHealthProfile).mockReset();
        vi.mocked(api.upsertPersonalHealthProfile).mockReset();
        vi.mocked(liff.init).mockReset();
        vi.mocked(liff.getProfile).mockReset();
        vi.mocked(liff.isLoggedIn).mockReset();
    });

    const completeBasicStep = async (gender: '男' | '女' = '男') => {
        fireEvent.change(await screen.findByLabelText('姓名'), {
            target: { value: '張小明' },
        });
        fireEvent.change(screen.getByLabelText('年齡'), {
            target: { value: '30' },
        });
        // 性別已改用 shadcn Select：trigger 為 combobox、選項為 option。
        // 這裡用 userEvent 而非 fireEvent：Base UI 的彈出層要靠完整的指標事件
        // 序列才會關閉，只送 click 會選到值卻留著彈出層，而開啟期間整頁被設為
        // inert（data-base-ui-inert），後續的「下一步」點擊就不會生效。
        const user = userEvent.setup();
        await user.click(screen.getByRole('combobox', { name: /性別/ }));
        await user.click(await screen.findByRole('option', { name: gender }));
        fireEvent.click(screen.getByRole('button', { name: '下一步' }));
        await screen.findByLabelText('身高 (cm)');
    };

    const completeBodyStep = async () => {
        fireEvent.change(screen.getByLabelText('身高 (cm)'), {
            target: { value: '175' },
        });
        fireEvent.change(screen.getByLabelText('體重 (kg)'), {
            target: { value: '70' },
        });
        fireEvent.click(screen.getByRole('button', { name: '下一步' }));
        await screen.findByRole('button', { name: /慢性病史/ });
    };

    const reachHealthHistoryStep = async (gender: '男' | '女' = '男') => {
        await completeBasicStep(gender);
        await completeBodyStep();
    };

    // ==========================================
    // 案例 1：性別必填檢查
    // ==========================================
    it('基本資料未選性別時，不能進到下一步', async () => {
        setupApiMocks();
        renderWithToaster(<PersonalHealthPage />);

        await waitFor(() => expect(screen.getByLabelText('姓名')).toHaveValue('LINE User'));
        fireEvent.change(screen.getByLabelText('年齡'), { target: { value: '30' } });

        expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled();
        expect(screen.getByText('請完成所有必填欄位後再繼續。')).toBeInTheDocument();
        expect(api.upsertPersonalHealthProfile).not.toHaveBeenCalled();
    });

    // ==========================================
    // 案例 2：數值範圍驗證
    // ==========================================
    it('案例 2：當輸入無效的數值（年齡、身高、體重超出範圍）時，應攔截並顯示錯誤提示', async () => {
        setupApiMocks();
        renderWithToaster(<PersonalHealthPage />);

        fireEvent.change(await screen.findByLabelText('姓名'), {
            target: { value: '張小明' },
        });
        const ageInput = screen.getByPlaceholderText('請輸入年齡');
        fireEvent.change(ageInput, { target: { value: '150' } });
        fireEvent.blur(ageInput);
        const user = userEvent.setup();
        await user.click(screen.getByRole('combobox', { name: /性別/i }));
        await user.click(await screen.findByRole('option', { name: '男' }));

        expect(await screen.findByText((content) => content.includes('年齡') && content.includes('130'))).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled();

        fireEvent.change(ageInput, { target: { value: '30' } });
        fireEvent.blur(ageInput);
        fireEvent.click(screen.getByRole('button', { name: '下一步' }));

        const heightInput = await screen.findByPlaceholderText('請輸入身高');
        const weightInput = screen.getByPlaceholderText('請輸入體重');
        fireEvent.change(heightInput, { target: { value: '20' } });
        fireEvent.blur(heightInput);
        fireEvent.change(weightInput, { target: { value: '600' } });
        fireEvent.blur(weightInput);

        expect(screen.getByText((content) => content.includes('身高') && content.includes('300'))).toBeInTheDocument();
        expect(screen.getByText((content) => content.includes('體重') && content.includes('500'))).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled();
        expect(api.upsertPersonalHealthProfile).not.toHaveBeenCalled();
    });

    // ==========================================
    // 案例 3：慢性病史組合邏輯 - 勾選一般選項
    // ==========================================
    it('勾選一般選項（高血壓、糖尿病）直接送出 → payload 的 chronic_history 正確 join', async () => {
        setupApiMocks();
        const upsertMock = vi.mocked(api.upsertPersonalHealthProfile);
        renderWithToaster(<PersonalHealthPage />);
        await reachHealthHistoryStep('男');

        // 開啟慢性病選單並勾選「高血壓」與「糖尿病」
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: /慢性病史/ }));
        await user.click(await screen.findByRole('checkbox', { name: /高血壓/ }));
        await user.click(await screen.findByRole('checkbox', { name: /糖尿病/ }));

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
        setupApiMocks();
        const upsertMock = vi.mocked(api.upsertPersonalHealthProfile);
        renderWithToaster(<PersonalHealthPage />);
        await reachHealthHistoryStep('女');

        // 勾選一般項目「氣喘」與「其他」
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: /慢性病史/ }));
        await user.click(await screen.findByRole('checkbox', { name: /氣喘/ }));
        await user.click(await screen.findByRole('checkbox', { name: /其他/ }));

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
        setupApiMocks();
        const upsertMock = vi.mocked(api.upsertPersonalHealthProfile);
        renderWithToaster(<PersonalHealthPage />);
        await reachHealthHistoryStep('男');

        // 只勾選「其他」，但不填寫文字輸入框
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: /慢性病史/ }));
        await user.click(await screen.findByRole('checkbox', { name: /其他/ }));

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
                name: '王大錘',
                gender: '男',
                height: 180,
                weight: 75,
                age: 25,
                chronic_history: '無'
            });

            // 模擬 LIFF 回傳名稱為 "LINE User"
            vi.mocked(liff.getProfile).mockResolvedValue({
                displayName: 'LINE User',
                pictureUrl: 'https://line.me/avatar.png'
            });

            renderWithToaster(<PersonalHealthPage />);

            // 驗證輸入框與標題最終顯示的是資料庫的 "王大錘"
            const nameInput = await screen.findByLabelText('姓名');
            expect(nameInput).toHaveValue('王大錘');
            expect(screen.getByText('王大錘 的健康資料')).toBeInTheDocument();
        });

        it('B. 當資料庫沒有姓名時 → 應 fallback 使用 LIFF 的 displayName', async () => {
            // 模擬資料庫回傳 null 或沒有 name 欄位
            setupApiMocks(null);

            // 模擬 LIFF 回傳名稱為 "LINE User"
            vi.mocked(liff.getProfile).mockResolvedValue({
                displayName: 'LINE User',
                pictureUrl: 'https://line.me/avatar.png'
            });

            renderWithToaster(<PersonalHealthPage />);

            // 驗證輸入框與標題最終後退一步（fallback）採用 LIFF 的 "LINE User"
            const nameInput = await screen.findByLabelText('姓名');
            expect(nameInput).toHaveValue('LINE User');
            expect(screen.getByText('LINE User 的健康資料')).toBeInTheDocument();
        });
    });
});
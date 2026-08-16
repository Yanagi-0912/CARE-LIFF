import { fireEvent, screen, waitFor } from '@testing-library/react';
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
// 避免測試中因 useNavigate 導致錯誤，只把 useNavigate 換掉、其餘照舊。
// factory 必須是 async 並 await importActual——它回傳的是 Promise，
// 直接展開會得到空物件，等於把 react-router-dom 的其他匯出全部變成 undefined。
vi.mock('react-router-dom', async () => ({
    ...(await vi.importActual<typeof import('react-router-dom')>('react-router-dom')),
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
        // 慢性病選項現在直接攤在頁面上（不再是 Popover），出現任一個勾選框就代表已到第三步
        await screen.findByRole('checkbox', { name: '高血壓' });
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

        // 驗證改由 resolver 非同步執行，需等待錯誤訊息出現
        expect(await screen.findByText((content) => content.includes('身高') && content.includes('300'))).toBeInTheDocument();
        expect(await screen.findByText((content) => content.includes('體重') && content.includes('500'))).toBeInTheDocument();
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

        // 勾選「高血壓」與「糖尿病」
        const user = userEvent.setup();
        await user.click(await screen.findByRole('checkbox', { name: /高血壓/ }));
        await user.click(await screen.findByRole('checkbox', { name: /糖尿病/ }));

        // 送出表單
        fireEvent.click(screen.getByRole('button', { name: '儲存紀錄' }));

        await waitFor(() => {
            expect(upsertMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    chronic_diseases: ['hypertension', 'diabetes'],
                    chronic_custom: [],
                    height: 175,  // 驗證有轉型為 Number
                    weight: 70,
                    age: 30,
                })
            );
        });
        expect(await screen.findByText('已成功儲存個人健康資料')).toBeInTheDocument();
    });

    // ==========================================
    // 案例 4：自訂慢性病 —— 輸入後按「新增」變成標籤
    // ==========================================
    it('輸入自訂病名並按「新增」→ 變成標籤，送出後包含該病名', async () => {
        setupApiMocks();
        const upsertMock = vi.mocked(api.upsertPersonalHealthProfile);
        renderWithToaster(<PersonalHealthPage />);
        await reachHealthHistoryStep('女');

        const user = userEvent.setup();
        await user.click(await screen.findByRole('checkbox', { name: /氣喘/ }));

        // 自訂區永遠在，不必先勾一個「其他」才看得到輸入框
        fireEvent.change(screen.getByPlaceholderText('請輸入其他慢性病'), {
            target: { value: '胃食道逆流' },
        });
        fireEvent.click(screen.getByRole('button', { name: '新增' }));

        // 變成一張可刪的標籤，輸入框清空讓他能接著打下一個
        expect(screen.getByRole('button', { name: '移除 胃食道逆流' })).toBeInTheDocument();
        expect(screen.getByPlaceholderText('請輸入其他慢性病')).toHaveValue('');

        fireEvent.click(screen.getByRole('button', { name: '儲存紀錄' }));

        await waitFor(() => {
            expect(upsertMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    chronic_diseases: ['asthma'],
                    chronic_custom: ['胃食道逆流'],
                }),
            );
        });
    });

    it('多個自訂病名各自獨立，刪掉其中一個不影響另一個', async () => {
        setupApiMocks();
        const upsertMock = vi.mocked(api.upsertPersonalHealthProfile);
        renderWithToaster(<PersonalHealthPage />);
        await reachHealthHistoryStep('女');

        const input = await screen.findByPlaceholderText('請輸入其他慢性病');
        for (const name of ['腦溢血', '痛風']) {
            fireEvent.change(input, { target: { value: name } });
            fireEvent.click(screen.getByRole('button', { name: '新增' }));
        }

        // 只刪掉腦溢血，痛風要留著
        fireEvent.click(screen.getByRole('button', { name: '移除 腦溢血' }));
        expect(screen.queryByRole('button', { name: '移除 腦溢血' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: '移除 痛風' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '儲存紀錄' }));

        await waitFor(() => {
            expect(upsertMock).toHaveBeenCalledWith(
                expect.objectContaining({ chronic_diseases: [], chronic_custom: ['痛風'] }),
            );
        });
    });

    // 舊流程要先按打勾「確認」，沒按就整次儲存被擋下——使用者看到的是
    // 「我改了、按了儲存，重開卻還是舊資料」，比資料遺失更難察覺。
    // 現在按「新增」只是方便，直接按儲存也要能存進去。
    it('打了字沒按「新增」就儲存 → 自動補上，不會丟掉也不會擋下', async () => {
        setupApiMocks();
        const upsertMock = vi.mocked(api.upsertPersonalHealthProfile);
        renderWithToaster(<PersonalHealthPage />);
        await reachHealthHistoryStep('女');

        fireEvent.change(await screen.findByPlaceholderText('請輸入其他慢性病'), {
            target: { value: '腦溢血' },
        });
        fireEvent.click(screen.getByRole('button', { name: '儲存紀錄' }));

        await waitFor(() => {
            expect(upsertMock).toHaveBeenCalledWith(
                expect.objectContaining({ chronic_diseases: [], chronic_custom: ['腦溢血'] }),
            );
        });
    });

    it('自訂病名打到固定選項 → 幫他勾起卡片，不另外開一筆標籤', async () => {
        setupApiMocks();
        const upsertMock = vi.mocked(api.upsertPersonalHealthProfile);
        renderWithToaster(<PersonalHealthPage />);
        await reachHealthHistoryStep('女');

        fireEvent.change(await screen.findByPlaceholderText('請輸入其他慢性病'), {
            target: { value: '高血壓' },
        });
        fireEvent.click(screen.getByRole('button', { name: '新增' }));

        expect(screen.getByRole('checkbox', { name: /高血壓/ })).toBeChecked();
        expect(screen.queryByRole('button', { name: '移除 高血壓' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '儲存紀錄' }));

        await waitFor(() => {
            expect(upsertMock).toHaveBeenCalledWith(
                // 打的是中文「高血壓」，存進去的必須是 code
                expect.objectContaining({
                    chronic_diseases: ['hypertension'],
                    chronic_custom: [],
                }),
            );
        });
    });

    it('重複新增同一個病名 → 不新增並提示', async () => {
        setupApiMocks();
        renderWithToaster(<PersonalHealthPage />);
        await reachHealthHistoryStep('女');

        const input = await screen.findByPlaceholderText('請輸入其他慢性病');
        const addSameName = () => {
            fireEvent.change(input, { target: { value: '腦溢血' } });
            fireEvent.click(screen.getByRole('button', { name: '新增' }));
        };
        addSameName();
        addSameName();

        expect(await screen.findByText('腦溢血 已經在清單裡了')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: '移除 腦溢血' })).toHaveLength(1);
    });

    // ==========================================
    // 案例 4-1：自訂慢性病要能來回（存檔 → 重新載入 → 改得動）
    // ==========================================
    it('載入含自訂值的慢性病 → 還原成標籤，且改得動也刪得掉', async () => {
        setupApiMocks({ chronic_diseases: ['asthma'], chronic_custom: ['胃食道逆流'] });
        const upsertMock = vi.mocked(api.upsertPersonalHealthProfile);
        renderWithToaster(<PersonalHealthPage />);
        await reachHealthHistoryStep('女');

        expect(await screen.findByRole('checkbox', { name: /氣喘/ })).toBeChecked();
        expect(screen.getByRole('button', { name: '移除 胃食道逆流' })).toBeInTheDocument();

        // 下方摘要要列出真正的病名，不是「其他」這兩個字
        expect(screen.getByText('氣喘、胃食道逆流')).toBeInTheDocument();
        expect(screen.queryByText('氣喘、其他')).not.toBeInTheDocument();

        // 換掉自訂值：刪舊的、加新的
        fireEvent.click(screen.getByRole('button', { name: '移除 胃食道逆流' }));
        fireEvent.change(screen.getByPlaceholderText('請輸入其他慢性病'), {
            target: { value: '痛風' },
        });
        fireEvent.click(screen.getByRole('button', { name: '新增' }));
        fireEvent.click(screen.getByRole('button', { name: '儲存紀錄' }));

        await waitFor(() => {
            expect(upsertMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    chronic_diseases: ['asthma'],
                    chronic_custom: ['痛風'],
                }),
            );
        });
    });

    // ==========================================
    // 案例 5：什麼都沒選 → 兩個空陣列
    // ==========================================
    // 過去這裡存的是「無」。哨兵值混在資料裡，讀的人得先知道「無」不是病名
    // 才能正確處理；空陣列本身就表示沒有，不需要任何約定。
    it('沒勾任何選項也沒打自訂病名 → 存成兩個空陣列，不再有「無」', async () => {
        setupApiMocks();
        const upsertMock = vi.mocked(api.upsertPersonalHealthProfile);
        renderWithToaster(<PersonalHealthPage />);
        await reachHealthHistoryStep('男');

        fireEvent.click(await screen.findByRole('button', { name: '儲存紀錄' }));

        await waitFor(() => {
            expect(upsertMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    chronic_diseases: [],
                    chronic_custom: [],
                    major_illness_history: '',
                    surgery_history: '',
                }),
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
                gender: 'male',
                height: 180,
                weight: 75,
                age: 25,
                chronic_diseases: [],
                chronic_custom: [],
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

            // 驗證輸入框與標題最終後退一步（fallback）採用 LIFF 的 "LINE User"。
            // 姓名是等 LIFF 就緒後才補上的，findBy 只保證輸入框存在、不保證已填值，
            // 所以斷言要包在 waitFor 裡等它到位。
            const nameInput = await screen.findByLabelText('姓名');
            await waitFor(() => expect(nameInput).toHaveValue('LINE User'));
            expect(screen.getByText('LINE User 的健康資料')).toBeInTheDocument();
        });
    });
});
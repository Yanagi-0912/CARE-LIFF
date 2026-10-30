import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderWithToaster } from './testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import liff from '@line/liff';

// 1. 匯入整包 API 物件，方便後面使用 vi.mocked 存取
import * as api from '../api/profileApi';
import type { HealthProfile } from '../api/profileApi';
import PersonalHealthPage from '../pages/PersonalHealth/index.tsx';
import { queryKeys } from '@/lib/queryClient';
import { Toaster } from '@/components/ui/sonner';
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
        getProfile: vi.fn(() => Promise.resolve({ displayName: 'LINE User', pictureUrl: 'https://line.me/avatar.png', userId: 'U-line-user' })),
        isLoggedIn: vi.fn(() => true),
    },
}));
function NavigationHarness() {
    const navigate = useNavigate();
    const location = useLocation();
    return <>
        <div data-testid="profile-location">{location.pathname}{location.search}</div>
        <button onClick={() => navigate(-1)}>瀏覽器返回</button>
        <button onClick={() => navigate(1)}>瀏覽器前進</button>
        <button onClick={() => navigate('/elsewhere')}>離開個人健康</button>
        <button onClick={() => navigate('/personalhealth?view=edit')}>重新開啟編輯</button>
        <Routes>
            <Route path="/personalhealth" element={<PersonalHealthPage />} />
            <Route path="/elsewhere" element={<p>其他頁面</p>} />
        </Routes>
    </>;
}

function renderProfile(initialEntry = '/personalhealth') {
    return renderWithToaster(<MemoryRouter initialEntries={[initialEntry]}><NavigationHarness /></MemoryRouter>);
}

function deferredSave() {
    let resolve!: (value: { success: boolean }) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<{ success: boolean }>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function setupApiMocks(profile: HealthProfile | null = null) {
    vi.mocked(api.getPersonalHealthProfile).mockResolvedValue(profile);
    vi.mocked(api.upsertPersonalHealthProfile).mockResolvedValue({ success: true });
    vi.mocked(liff.init).mockResolvedValue(undefined);
    vi.mocked(liff.getProfile).mockResolvedValue({
        displayName: 'LINE User',
        pictureUrl: 'https://line.me/avatar.png', userId: 'U-line-user',
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

    /**
     * 等表單出現、而且 LINE 的顯示名稱已經補進姓名欄。
     *
     * 姓名欄的值由伺服器資料與 LIFF 名稱「算出來」，LIFF 名稱晚一步回來時表單會
     * 重新同步一次（沒動過的欄位會補上，驗證訊息也會清掉）。先等它到位，後面的
     * 輸入與驗證斷言才不會跟那次同步搶先後。
     */
    const waitForFormReady = async (name = 'LINE User') => {
        if (!screen.queryByLabelText('姓名')) {
            fireEvent.click(await screen.findByRole('button', { name: '詳細個人資料' }));
            fireEvent.click(await screen.findByRole('button', { name: '編輯個人資料' }));
        }
        const nameInput = await screen.findByLabelText('姓名');
        await waitFor(() => expect(nameInput).toHaveValue(name));
        return nameInput;
    };

    const completeBasicFields = async (gender: '男' | '女' = '男') => {
        fireEvent.change(await waitForFormReady(), {
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
        await screen.findByLabelText('身高 (cm)');
    };

    const completeBodyFields = async () => {
        fireEvent.change(screen.getByLabelText('身高 (cm)'), {
            target: { value: '175' },
        });
        fireEvent.change(screen.getByLabelText('體重 (kg)'), {
            target: { value: '70' },
        });
        fireEvent.click(screen.getByRole('button', { name: /健康紀錄/ }));
        await screen.findByRole('checkbox', { name: '高血壓' });
    };

    const fillAndExpandHistory = async (gender: '男' | '女' = '男') => {
        await completeBasicFields(gender);
        await completeBodyFields();
    };

    it('先顯示摘要，詳細資料唯讀且空病史顯示尚未填寫', async () => {
        setupApiMocks({ name: '陳明德', age: 65, gender: 'male', height: 165, weight: 60 });
        renderProfile();
        expect(await screen.findByText('陳明德')).toBeInTheDocument();
        expect(screen.queryByLabelText('姓名')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '詳細個人資料' }));
        expect(screen.getAllByText('尚未填寫')).toHaveLength(3);
        expect(screen.getByRole('heading', { name: '身體數值' })).toBeInTheDocument();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it.each(['取消', '返回'])('%s 捨棄編輯並回到詳細資料', async (button) => {
        setupApiMocks({ name: '陳明德', age: 65, gender: 'male', height: 165, weight: 60 });
        renderProfile();
        await waitForFormReady('陳明德');
        fireEvent.change(screen.getByLabelText('年齡'), { target: { value: '70' } });
        fireEvent.click(screen.getByRole('button', { name: button, exact: true }));
        expect(screen.getByRole('heading', { name: '詳細個人資料' })).toBeInTheDocument();
        expect(api.upsertPersonalHealthProfile).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: '編輯個人資料' }));
        expect(screen.getByLabelText('年齡')).toHaveValue(65);
    });

    it('儲存全部欄位後回到詳細資料，摘要立即同步年齡', async () => {
        setupApiMocks({ name: '陳明德', age: 65, gender: 'male', height: 165, weight: 60 });
        renderProfile();
        await waitForFormReady('陳明德');
        fireEvent.change(screen.getByLabelText('年齡'), { target: { value: '66' } });
        fireEvent.click(screen.getByRole('button', { name: /健康紀錄/ }));
        fireEvent.change(screen.getByPlaceholderText('請輸入其他慢性病'), { target: { value: '痛風' } });
        fireEvent.change(screen.getByLabelText('開刀紀錄'), { target: { value: '白內障手術' } });
        fireEvent.click(screen.getByRole('button', { name: /健康紀錄/ }));
        fireEvent.click(screen.getByRole('button', { name: '儲存紀錄' }));
        expect(await screen.findByRole('heading', { name: '詳細個人資料' })).toBeInTheDocument();
        const savedHistory = within(screen.getByRole('region', { name: '健康紀錄' }));
        expect(savedHistory.getByText('痛風')).toBeVisible();
        expect(savedHistory.getByText('白內障手術')).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: '返回' }));
        expect(screen.getByText('66 歲')).toBeInTheDocument();
    });

    it('儲存失敗時保留編輯内容，允許重試', async () => {
        setupApiMocks({ name: '陳明德', age: 65, gender: 'male', height: 165, weight: 60 });
        vi.mocked(api.upsertPersonalHealthProfile).mockRejectedValueOnce(new Error('暫時無法儲存'));
        renderProfile();
        await waitForFormReady('陳明德');
        fireEvent.change(screen.getByLabelText('年齡'), { target: { value: '66' } });
        fireEvent.click(screen.getByRole('button', { name: '儲存紀錄' }));
        expect(await screen.findByText('暫時無法儲存')).toBeInTheDocument();
        expect(screen.getByLabelText('年齡')).toHaveValue(66);
        fireEvent.click(screen.getByRole('button', { name: '儲存紀錄' }));
        expect(await screen.findByRole('heading', { name: '詳細個人資料' })).toBeInTheDocument();
    });

    it('網址可直接開啟編輯，重新掛載後仍停在編輯畫面', async () => {
        setupApiMocks({ name: '陳明德', age: 65, gender: 'male', height: 165, weight: 60 });
        renderProfile('/personalhealth?view=edit');
        expect(await screen.findByRole('heading', { name: '編輯個人資料' })).toBeInTheDocument();
        expect(await screen.findByLabelText('年齡')).toHaveValue(65);
    });

    it('瀏覽器依序返回詳細資料與摘要，前進後保留未儲存內容', async () => {
        setupApiMocks({ name: '陳明德', age: 65, gender: 'male', height: 165, weight: 60 });
        renderProfile();
        await waitForFormReady('陳明德');
        expect(screen.getByTestId('profile-location')).toHaveTextContent('/personalhealth?view=edit');
        fireEvent.change(screen.getByLabelText('年齡'), { target: { value: '70' } });
        fireEvent.click(screen.getByRole('button', { name: '瀏覽器返回' }));
        expect(screen.getByRole('heading', { name: '詳細個人資料' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '瀏覽器返回' }));
        expect(screen.getByRole('heading', { name: '個人健康' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '瀏覽器前進' }));
        fireEvent.click(screen.getByRole('button', { name: '瀏覽器前進' }));
        expect(screen.getByLabelText('年齡')).toBeVisible();
        expect(screen.getByLabelText('年齡')).toHaveValue(70);
    });

    it('取消後由瀏覽器前進重新編輯，後續返回仍保留新的草稿', async () => {
        setupApiMocks({ name: '陳明德', age: 65, gender: 'male', height: 165, weight: 60 });
        renderProfile();
        await waitForFormReady('陳明德');
        fireEvent.click(screen.getByRole('button', { name: '取消', exact: true }));
        fireEvent.click(screen.getByRole('button', { name: '瀏覽器前進' }));
        fireEvent.change(screen.getByLabelText('年齡'), { target: { value: '70' } });
        fireEvent.click(screen.getByRole('button', { name: '瀏覽器返回' }));
        fireEvent.click(screen.getByRole('button', { name: '瀏覽器前進' }));
        expect(screen.getByLabelText('年齡')).toHaveValue(70);
    });

    it('儲存等待回應時禁止返回與重複送出，失敗後保留草稿', async () => {
        setupApiMocks({ name: '陳明德', age: 65, gender: 'male', height: 165, weight: 60 });
        const pending = deferredSave();
        vi.mocked(api.upsertPersonalHealthProfile).mockReturnValue(pending.promise);
        renderProfile();
        await waitForFormReady('陳明德');
        fireEvent.change(screen.getByLabelText('年齡'), { target: { value: '66' } });
        const form = screen.getByLabelText('年齡').closest('form')!;
        fireEvent.submit(form);
        fireEvent.submit(form);
        await waitFor(() => expect(screen.getByRole('button', { name: '返回', exact: true })).toBeDisabled());
        expect(screen.getByRole('button', { name: '取消', exact: true })).toBeDisabled();
        expect(api.upsertPersonalHealthProfile).toHaveBeenCalledTimes(1);
        await act(async () => pending.reject(new Error('暫時無法儲存')));
        expect(await screen.findByText('暫時無法儲存')).toBeInTheDocument();
        expect(screen.getByLabelText('年齡')).toHaveValue(66);
        expect(screen.getByRole('button', { name: '返回', exact: true })).toBeEnabled();
    });

    it('儲存時離開頁面再進入，舊回應不得導向詳細資料或允許重複儲存', async () => {
        setupApiMocks({ name: '陳明德', age: 65, gender: 'male', height: 165, weight: 60 });
        const pending = deferredSave();
        vi.mocked(api.upsertPersonalHealthProfile).mockReturnValue(pending.promise);
        renderProfile();
        await waitForFormReady('陳明德');
        fireEvent.change(screen.getByLabelText('年齡'), { target: { value: '66' } });
        fireEvent.click(screen.getByRole('button', { name: '儲存紀錄' }));
        await waitFor(() => expect(api.upsertPersonalHealthProfile).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: '離開個人健康' }));
        fireEvent.click(screen.getByRole('button', { name: '重新開啟編輯' }));
        expect(await screen.findByRole('heading', { name: '編輯個人資料' })).toBeInTheDocument();
        expect(screen.getByLabelText('年齡')).toBeDisabled();
        await act(async () => pending.resolve({ success: true }));
        expect(screen.getByRole('heading', { name: '編輯個人資料' })).toBeInTheDocument();
        expect(screen.getByLabelText('年齡')).toHaveValue(66);
        fireEvent.change(screen.getByLabelText('年齡'), { target: { value: '70' } });
        expect(screen.getByLabelText('年齡')).toHaveValue(70);
    });

    it('收合病史仍顯示已填項目數，展開後呈現已選慢性病摘要', async () => {
        setupApiMocks({
            name: '陳明德', age: 65, gender: 'male', height: 165, weight: 60,
            chronic_diseases: ['hypertension'], chronic_custom: ['痛風'],
            major_illness_history: '冠心病', surgery_history: '白內障手術',
        });
        renderProfile();
        await waitForFormReady('陳明德');
        expect(screen.getByText('已填寫 4 項')).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: /健康紀錄/ }));
        expect(screen.getByText('已選慢性病：高血壓、痛風')).toBeVisible();
        await userEvent.setup().click(screen.getByRole('checkbox', { name: '糖尿病' }));
        expect(screen.getByText('已填寫 5 項')).toBeVisible();
        expect(screen.getByText('已選慢性病：高血壓、糖尿病、痛風')).toBeVisible();
    });

    it('未儲存內容在重新整理前提示，明確取消後解除提示', async () => {
        setupApiMocks({ name: '陳明德', age: 65, gender: 'male', height: 165, weight: 60 });
        renderProfile();
        await waitForFormReady('陳明德');
        fireEvent.change(screen.getByLabelText('年齡'), { target: { value: '70' } });
        const beforeUnload = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(beforeUnload);
        expect(beforeUnload.defaultPrevented).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: '取消', exact: true }));
        const afterDiscard = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(afterDiscard);
        expect(afterDiscard.defaultPrevented).toBe(false);
    });

    // ==========================================
    // 案例 1：性別必填檢查
    // ==========================================
    it('基本資料未選性別時不能儲存', async () => {
        setupApiMocks();
        renderProfile();

        await waitForFormReady();
        fireEvent.change(screen.getByLabelText('年齡'), { target: { value: '30' } });

        expect(screen.getByRole('button', { name: '儲存紀錄' })).toBeDisabled();
        expect(screen.getByText('請完成必填欄位後儲存。')).toBeInTheDocument();
        expect(api.upsertPersonalHealthProfile).not.toHaveBeenCalled();
    });

    // ==========================================
    // 案例 2：數值範圍驗證
    // ==========================================
    it('案例 2：當輸入無效的數值（年齡、身高、體重超出範圍）時，應攔截並顯示錯誤提示', async () => {
        setupApiMocks();
        renderProfile();

        fireEvent.change(await waitForFormReady(), {
            target: { value: '張小明' },
        });
        const ageInput = screen.getByPlaceholderText('請輸入年齡');
        fireEvent.change(ageInput, { target: { value: '150' } });
        fireEvent.blur(ageInput);
        const user = userEvent.setup();
        await user.click(screen.getByRole('combobox', { name: /性別/i }));
        await user.click(await screen.findByRole('option', { name: '男' }));

        expect(await screen.findByText((content) => content.includes('年齡') && content.includes('130'))).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '儲存紀錄' })).toBeDisabled();

        fireEvent.change(ageInput, { target: { value: '30' } });
        fireEvent.blur(ageInput);

        const heightInput = await screen.findByPlaceholderText('請輸入身高');
        const weightInput = screen.getByPlaceholderText('請輸入體重');
        fireEvent.change(heightInput, { target: { value: '20' } });
        fireEvent.blur(heightInput);
        fireEvent.change(weightInput, { target: { value: '600' } });
        fireEvent.blur(weightInput);

        // 驗證改由 resolver 非同步執行，需等待錯誤訊息出現
        expect(await screen.findByText((content) => content.includes('身高') && content.includes('300'))).toBeInTheDocument();
        expect(await screen.findByText((content) => content.includes('體重') && content.includes('500'))).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '儲存紀錄' })).toBeDisabled();
        expect(api.upsertPersonalHealthProfile).not.toHaveBeenCalled();
    });

    // ==========================================
    // 案例 3：慢性病史組合邏輯 - 勾選一般選項
    // ==========================================
    it('勾選一般選項（高血壓、糖尿病）直接送出 → payload 的 chronic_diseases 正確保存', async () => {
        setupApiMocks();
        const upsertMock = vi.mocked(api.upsertPersonalHealthProfile);
        renderProfile();
        await fillAndExpandHistory('男');

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
        renderProfile();
        await fillAndExpandHistory('女');

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
        renderProfile();
        await fillAndExpandHistory('女');

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
        renderProfile();
        await fillAndExpandHistory('女');

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
        renderProfile();
        await fillAndExpandHistory('女');

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
        renderProfile();
        await fillAndExpandHistory('女');

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
        renderProfile();
        await fillAndExpandHistory('女');

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
        renderProfile();
        await fillAndExpandHistory('男');

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

    it('儲存成功後讓 myProfile 快取失效（首頁與側欄共用同一份）', async () => {
        const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
        setupApiMocks();
        renderProfile();
        await fillAndExpandHistory('男');

        fireEvent.click(screen.getByRole('button', { name: '儲存紀錄' }));

        expect(await screen.findByText('已成功儲存個人健康資料')).toBeInTheDocument();
        expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toContainEqual(
            queryKeys.myProfile,
        );
        invalidate.mockRestore();
    });

    // ==========================================
    // 案例 6：讀取狀態——讀到之前、讀取失敗時都不給表單
    // ==========================================
    // 後端 PUT /me/update 是整份覆寫。讀取失敗時若照樣顯示空白表單，
    // 使用者按一次儲存就會把原本的慢性病與病史清掉。
    describe('案例 6：讀取健康檔案', () => {
        it('資料回來之前不渲染表單，只顯示讀取中', async () => {
            setupApiMocks();
            vi.mocked(api.getPersonalHealthProfile).mockReturnValue(new Promise(() => {}));
            await act(async () => { renderProfile(); });

            expect(screen.getByRole('status')).toHaveTextContent('正在讀取您的健康資料…');
            expect(screen.queryByLabelText('姓名')).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: '儲存紀錄' })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: /查看諮詢紀錄/ })).toBeEnabled();
        });

        it('讀取失敗時不渲染表單，只有錯誤說明與重新載入；重新載入成功後才出現表單並帶入資料', async () => {
            setupApiMocks();
            vi.mocked(api.getPersonalHealthProfile)
                .mockRejectedValueOnce(new Error('取得個人資料失敗:500'))
                .mockResolvedValue({
                    name: '王大錘',
                    gender: 'male',
                    age: 72,
                    height: 168,
                    weight: 60,
                    chronic_diseases: ['hypertension'],
                    chronic_custom: [],
                });
            renderProfile();

            expect(await screen.findByText('取得個人資料失敗，請稍後再試。')).toBeInTheDocument();
            expect(
                screen.getByText('為了不蓋掉您原本填過的內容，要先讀取成功才能編輯。'),
            ).toBeInTheDocument();
            expect(screen.queryByLabelText('姓名')).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: '儲存紀錄' })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: /查看諮詢紀錄/ })).toBeEnabled();

            fireEvent.click(screen.getByRole('button', { name: '重新載入' }));

            await waitForFormReady('王大錘');
            expect(screen.getByLabelText('年齡')).toHaveValue(72);
            expect(api.upsertPersonalHealthProfile).not.toHaveBeenCalled();
        });

        it('還沒建檔（404 → null）照常顯示空白表單', async () => {
            setupApiMocks(null);
            renderProfile();

            await waitForFormReady();
            expect(screen.getByLabelText('年齡')).toHaveValue(null);
        });

        it.each([
            ['舊資料的佔位值', { name: '王大錘', gender: 'unknown', age: 0, height: 1, weight: 1 }],
            ['新版後端的 null', { name: '王大錘', gender: 'unknown', age: null, height: null, weight: null }],
        ])('%s 顯示成空白，不帶入 0 與 1', async (_label, profile) => {
            setupApiMocks(profile);
            renderProfile();

            await waitForFormReady('王大錘');
            const ageInput = screen.getByLabelText('年齡');
            expect(ageInput).toHaveValue(null);
            expect(screen.getByRole('combobox', { name: /性別/ })).toHaveTextContent('請選擇性別');

            // 未設定的數值在同一頁中保持空白。
            fireEvent.change(ageInput, { target: { value: '72' } });
            const user = userEvent.setup();
            await user.click(screen.getByRole('combobox', { name: /性別/ }));
            await user.click(await screen.findByRole('option', { name: '男' }));

            expect(await screen.findByLabelText('身高 (cm)')).toHaveValue(null);
            expect(screen.getByLabelText('體重 (kg)')).toHaveValue(null);
        });

        it('背景重抓回來時不蓋掉正在打的字，但會補上沒動過的欄位', async () => {
            setupApiMocks({ name: '王大錘', gender: 'male', age: 72, height: 168, weight: 60 });
            // 自己建 client，才能模擬「快取被背景重抓的結果換掉」
            const client = new QueryClient({
                defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
            });
            render(
                <QueryClientProvider client={client}>
                    <MemoryRouter><PersonalHealthPage /></MemoryRouter>
                    <Toaster />
                </QueryClientProvider>,
            );

            await waitForFormReady('王大錘');
            const ageInput = screen.getByLabelText('年齡');
            expect(ageInput).toHaveValue(72);
            fireEvent.change(ageInput, { target: { value: '73' } });

            // 另一支裝置改了姓名與年齡，背景重抓帶回新資料
            act(() => {
                client.setQueryData(queryKeys.myProfile, {
                    name: '王大鎚',
                    gender: 'male',
                    age: 80,
                    height: 168,
                    weight: 60,
                });
            });

            await waitFor(() => expect(screen.getByLabelText('姓名')).toHaveValue('王大鎚'));
            expect(ageInput).toHaveValue(73);
        });
    });

    // ==========================================
    // 案例 7：姓名優先順序驗證
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
                pictureUrl: 'https://line.me/avatar.png', userId: 'U-line-user'
            });

            renderProfile();

            // 驗證輸入框與標題最終顯示的是資料庫的 "王大錘"
            await waitForFormReady('王大錘');
        });

        it('B. 當資料庫沒有姓名時 → 應 fallback 使用 LIFF 的 displayName', async () => {
            // 模擬資料庫回傳 null 或沒有 name 欄位
            setupApiMocks(null);

            // 模擬 LIFF 回傳名稱為 "LINE User"
            vi.mocked(liff.getProfile).mockResolvedValue({
                displayName: 'LINE User',
                pictureUrl: 'https://line.me/avatar.png', userId: 'U-line-user'
            });

            renderProfile();

            // 驗證輸入框與標題最終後退一步（fallback）採用 LIFF 的 "LINE User"。
            // 姓名是等 LIFF 就緒後才補上的，findBy 只保證輸入框存在、不保證已填值，
            // 所以斷言要包在 waitFor 裡等它到位。
            await waitForFormReady();
        });
    });
});

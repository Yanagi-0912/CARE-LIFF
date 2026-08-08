import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderWithToaster } from './testUtils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import liff from '@line/liff'

// 1. 匯入整包 API 物件，方便後面使用 vi.mocked 存取
import * as api from '../api/consultationApi'
import ConsultRecordsPage from '../pages/PersonalHealth/ConsultRecords'
import i18n from '../i18n'

// 2. 直接在 mock 內部定義 mock 函式，檔案頂端不再需要宣告一堆 const 變數
vi.mock('../api/consultationApi', () => ({
    getAllSummaries: vi.fn(),
    fetchConsultationMeRaw: vi.fn(),
    getConsultationSummaryDownloadToken: vi.fn(),
    buildConsultationSummaryDownloadUrl: vi.fn(),
}))

// Mock 外部的 liff 模組
vi.mock('@line/liff', () => ({
    default: {
        isInClient: vi.fn(() => false),
        openWindow: vi.fn(),
    }
}))

// ==========================================
// 共用 Mock Helper：統一設定四個 API 的預設回傳值，
// 個別測試可以透過 overrides 覆寫想要的行為（resolve 或 reject）
// ==========================================
type ApiMockOverrides = {
    getAllSummaries?: ReturnType<typeof vi.fn>
    fetchConsultationMeRaw?: ReturnType<typeof vi.fn>
    getConsultationSummaryDownloadToken?: ReturnType<typeof vi.fn>
    buildConsultationSummaryDownloadUrl?: ReturnType<typeof vi.fn>
}

function setupApiMocks(overrides: ApiMockOverrides = {}) {
    // 預設：沒有摘要、沒有對話紀錄
    vi.mocked(api.getAllSummaries).mockResolvedValue([])
    vi.mocked(api.fetchConsultationMeRaw).mockResolvedValue({ messages: [] })
    vi.mocked(api.getConsultationSummaryDownloadToken).mockResolvedValue({ downloadToken: 'mock-token-123' })
    vi.mocked(api.buildConsultationSummaryDownloadUrl).mockReturnValue('https://download.test/file.pdf')

    // 套用個別測試想要的 override
    if (overrides.getAllSummaries) vi.mocked(api.getAllSummaries).mockImplementation(overrides.getAllSummaries as any)
    if (overrides.fetchConsultationMeRaw) vi.mocked(api.fetchConsultationMeRaw).mockImplementation(overrides.fetchConsultationMeRaw as any)
    if (overrides.getConsultationSummaryDownloadToken) vi.mocked(api.getConsultationSummaryDownloadToken).mockImplementation(overrides.getConsultationSummaryDownloadToken as any)
    if (overrides.buildConsultationSummaryDownloadUrl) vi.mocked(api.buildConsultationSummaryDownloadUrl).mockImplementation(overrides.buildConsultationSummaryDownloadUrl as any)
}

describe('ConsultRecordsPage測試', () => {
    beforeEach(async () => {
        localStorage.clear()

        // 這個檔案原本沒初始化 i18n，畫面渲染出的是 consultRecord.xxx 這類
        // 原始 key 而非翻譯文字，導致所有以中文字串定位的斷言全部失敗。
        await i18n.changeLanguage('zh-TW')

        // 3. 使用 vi.mocked 幫 API 函式重置紀錄
        vi.mocked(api.getAllSummaries).mockReset()
        vi.mocked(api.fetchConsultationMeRaw).mockReset()
        vi.mocked(api.getConsultationSummaryDownloadToken).mockReset()
        vi.mocked(api.buildConsultationSummaryDownloadUrl).mockReset()

        vi.mocked(liff.isInClient).mockReset()
        vi.mocked(liff.openWindow).mockReset()
    })

    // 用於測試對話的超長訊息
    const mockRawMessages = {
        messages: [
            { message_type: 'text', content: '這是使用者的超長訊息測試字數一定要超級多超過五十個字不然測試會失敗喔現在字數應該夠多了吧' },
            { message_type: 'ai_response', content: '這是 AI 的回覆' }
        ]
    }

    // ==========================================
    // 案例 1：測試切換「摘要」與「對話」分頁
    // ==========================================
    it('點擊「對話」按鈕後，切換至對話列表並正確截斷文字', async () => {
        setupApiMocks({
            getAllSummaries: vi.fn().mockResolvedValue([]),
            fetchConsultationMeRaw: vi.fn().mockResolvedValue(mockRawMessages),
        })

        renderWithToaster(<ConsultRecordsPage />)

        // 使用 findByText 抓取分頁按鈕
        const chatTabButton = await screen.findByText('對話')
        fireEvent.click(chatTabButton)

        // 驗證長文字有被 truncateText 正確截斷
        // 只要畫面的某個節點「包含」這串文字的前段和三個點即可
        expect(await screen.findByText(/這是使用者的超長訊息測試字數.*.../)).toBeInTheDocument()
        expect(screen.getByText('這是 AI 的回覆')).toBeInTheDocument()

        // 驗證摘要選單不該出現在畫面上
        expect(screen.queryByLabelText('摘要日期')).not.toBeInTheDocument()
    })

    // ==========================================
    // 案例 2：測試對話紀錄的 Modal 彈窗功能
    // ==========================================
    it('在對話分頁點擊對話氣泡，能正確開啟與關閉 Modal 彈窗', async () => {
        setupApiMocks({
            getAllSummaries: vi.fn().mockResolvedValue([]),
            fetchConsultationMeRaw: vi.fn().mockResolvedValue(mockRawMessages),
        })

        renderWithToaster(<ConsultRecordsPage />)

        const chatTabButton = await screen.findByText('對話')
        fireEvent.click(chatTabButton)

        // 點擊對話紀錄以開啟 Modal
        const chatRow = await screen.findByText('這是 AI 的回覆')
        fireEvent.click(chatRow)

        // 驗證 Modal 彈窗出現
        const modal = screen.getByRole('dialog')
        expect(modal).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'AI 回覆' })).toBeInTheDocument()

        // 點擊×關閉按鈕
        const closeButton = screen.getByRole('button', { name: '關閉視窗' })
        fireEvent.click(closeButton)

        // 驗證 Modal 消失
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // ==========================================
    // 案例 3：測試 API 壞掉時的錯誤處理
    // ==========================================
    it('當 API 發生錯誤時，畫面能正確顯示錯誤訊息與 Empty State', async () => {
        setupApiMocks({
            getAllSummaries: vi.fn().mockRejectedValue(new Error('伺服器斷線')),
            fetchConsultationMeRaw: vi.fn().mockResolvedValue({ messages: [] }),
        })

        renderWithToaster(<ConsultRecordsPage />)

        // 驗證錯誤訊息被渲染
        expect(await screen.findByText('伺服器斷線')).toBeInTheDocument()

        // 切換到對話分頁
        const chatTabButton = screen.getByText('對話')
        fireEvent.click(chatTabButton)

        // 驗證對話的 Empty State
        expect(screen.getByText('目前沒有對話紀錄。')).toBeInTheDocument()
    })

    // ==========================================
    // 案例 4：測試下載功能（以 LIFF 環境為例）
    // ==========================================
    it('在 LIFF App 內點擊下載，會呼叫 liff.openWindow 並跳出成功通知', async () => {
        setupApiMocks()

        vi.mocked(liff.isInClient).mockReturnValue(true)

        renderWithToaster(<ConsultRecordsPage />)

        const downloadButton = await screen.findByText('下載所有摘要')
        fireEvent.click(downloadButton)

        await waitFor(() => {
            expect(liff.openWindow).toHaveBeenCalledWith({
                url: 'https://download.test/file.pdf',
                external: true
            })
        })

        expect(screen.getByText('下載連結已在外部瀏覽器開啟')).toBeInTheDocument()
    })

    // ==========================================
    // 案例 5（新增）：非 LIFF 環境下點擊下載，會直接導向下載網址
    // ==========================================
    it('在非 LIFF 環境點擊下載，會將 location.href 導向下載網址', async () => {
        setupApiMocks()

        vi.mocked(liff.isInClient).mockReturnValue(false)

        // 暫時替換 window.location，避免真的跳轉頁面
        const originalLocation = window.location
        // @ts-expect-error 測試用途，暫時刪除唯讀屬性以便替換
        delete window.location
        window.location = { href: '' } as unknown as Location

        renderWithToaster(<ConsultRecordsPage />)

        const downloadButton = await screen.findByText('下載所有摘要')
        fireEvent.click(downloadButton)

        await waitFor(() => {
            expect(window.location.href).toBe('https://download.test/file.pdf')
        })

        // 還原 window.location，避免影響其他測試
        window.location = originalLocation
    })

    // ==========================================
    // 案例 6（新增）：下載失敗時，會跳出錯誤通知
    // ==========================================
    it('下載摘要失敗時，會顯示錯誤 Toast 訊息', async () => {
        setupApiMocks({
            getConsultationSummaryDownloadToken: vi.fn().mockRejectedValue(new Error('下載連結取得失敗')),
        })

        renderWithToaster(<ConsultRecordsPage />)

        const downloadButton = await screen.findByText('下載所有摘要')
        fireEvent.click(downloadButton)

        // 驗證錯誤 Toast 顯示
        expect(await screen.findByText('下載連結取得失敗')).toBeInTheDocument()

        // 驗證失敗時不會呼叫 liff.openWindow
        expect(liff.openWindow).not.toHaveBeenCalled()
    })

    // ==========================================
    // 案例 7（新增）：測試「摘要」內容本身的渲染
    // 涵蓋 toSummarySections 的物件展開、陣列值、空值過濾邏輯
    // ==========================================
    it('摘要分頁能正確渲染物件格式的摘要內容，並過濾掉空值欄位', async () => {
        const mockSummaries = [
            {
                summary_date: '2026-07-01T00:00:00Z',
                summary: {
                    主訴: '頭痛與輕微發燒',
                    症狀: ['頭痛', '發燒', '疲倦'],
                    備註: '', // 空字串應被過濾掉，不顯示
                    其他資訊: null, // null 也應被過濾掉
                },
            },
        ]

        setupApiMocks({
            getAllSummaries: vi.fn().mockResolvedValue(mockSummaries),
        })

        renderWithToaster(<ConsultRecordsPage />)

        // 預設就是摘要分頁，驗證標題欄位有正確顯示
        expect(await screen.findByText('主訴')).toBeInTheDocument()
        expect(screen.getByText('頭痛與輕微發燒')).toBeInTheDocument()

        // 驗證陣列值有轉換成清單項目顯示
        expect(screen.getByText('症狀')).toBeInTheDocument()
        expect(screen.getByText('頭痛')).toBeInTheDocument()
        expect(screen.getByText('發燒')).toBeInTheDocument()
        expect(screen.getByText('疲倦')).toBeInTheDocument()

        // 驗證空值欄位（備註、其他資訊）不會被渲染出來
        expect(screen.queryByText('備註')).not.toBeInTheDocument()
        expect(screen.queryByText('其他資訊')).not.toBeInTheDocument()
    })

    it('摘要分頁能正確解析 JSON 字串格式的摘要內容', async () => {
        const mockSummaries = [
            {
                summary_date: '2026-07-02T00:00:00Z',
                summary: JSON.stringify({ 建議: '多喝水並多休息' }),
            },
        ]

        setupApiMocks({
            getAllSummaries: vi.fn().mockResolvedValue(mockSummaries),
        })

        renderWithToaster(<ConsultRecordsPage />)

        expect(await screen.findByText('建議')).toBeInTheDocument()
        expect(screen.getByText('多喝水並多休息')).toBeInTheDocument()
    })

    it('切換摘要日期下拉選單後，會顯示對應日期的摘要內容', async () => {
        const mockSummaries = [
            {
                summary_date: '2026-07-01T00:00:00Z',
                summary: { 主訴: '第一天的紀錄內容' },
            },
            {
                summary_date: '2026-07-02T00:00:00Z',
                summary: { 主訴: '第二天的紀錄內容' },
            },
        ]

        setupApiMocks({
            getAllSummaries: vi.fn().mockResolvedValue(mockSummaries),
        })

        renderWithToaster(<ConsultRecordsPage />)

        // 預設應顯示第一筆（最新／第一個）摘要內容
        expect(await screen.findByText('第一天的紀錄內容')).toBeInTheDocument()

        // 切換下拉選單至第二筆日期
        const select = screen.getByLabelText('摘要日期') as HTMLSelectElement
        fireEvent.change(select, { target: { value: '2026-07-02T00:00:00Z' } })

        // 驗證畫面內容切換為第二筆摘要
        expect(await screen.findByText('第二天的紀錄內容')).toBeInTheDocument()
        expect(screen.queryByText('第一天的紀錄內容')).not.toBeInTheDocument()
    })
})
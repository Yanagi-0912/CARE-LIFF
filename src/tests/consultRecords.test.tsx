import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import liff from '@line/liff'

// 1. 匯入整包 API 物件，方便後面使用 vi.mocked 存取
import * as api from '../api/consultationApi'
import ConsultRecordsPage from '../pages/PersonalHealth/ConsultRecords'

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

describe('ConsultRecordsPage測試', () => {
    beforeEach(() => {
        localStorage.clear()

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
        // 4. 使用 vi.mocked 指定該測試案例的回傳值
        vi.mocked(api.getAllSummaries).mockResolvedValue([])
        vi.mocked(api.fetchConsultationMeRaw).mockResolvedValue(mockRawMessages)

        render(<ConsultRecordsPage />)

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
        vi.mocked(api.getAllSummaries).mockResolvedValue([])
        vi.mocked(api.fetchConsultationMeRaw).mockResolvedValue(mockRawMessages)

        render(<ConsultRecordsPage />)

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
        vi.mocked(api.getAllSummaries).mockRejectedValue(new Error('伺服器斷線'))
        vi.mocked(api.fetchConsultationMeRaw).mockResolvedValue({ messages: [] })

        render(<ConsultRecordsPage />)

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
        vi.mocked(api.getAllSummaries).mockResolvedValue([])
        vi.mocked(api.fetchConsultationMeRaw).mockResolvedValue({ messages: [] })

        vi.mocked(api.getConsultationSummaryDownloadToken).mockResolvedValue({ downloadToken: 'mock-token-123' })
        vi.mocked(api.buildConsultationSummaryDownloadUrl).mockReturnValue('https://download.test/file.pdf')

        vi.mocked(liff.isInClient).mockReturnValue(true)

        render(<ConsultRecordsPage />)

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
})
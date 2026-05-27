import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ConsultRecordsPage from '../pages/PersonalHealth/ConsultRecords'

const mockFetchConsultationSummaries = vi.fn()
const mockFetchConsultationMeRaw = vi.fn()
const mockSummarizeConsultationMe = vi.fn()

vi.mock('../api/consultationApi', () => ({
    fetchConsultationSummaries: mockFetchConsultationSummaries,
    fetchConsultationMeRaw: mockFetchConsultationMeRaw,
    summarizeConsultationMe: mockSummarizeConsultationMe,
}))

describe('ConsultRecordsPage', () => {
    beforeEach(() => {
        localStorage.clear()
        mockFetchConsultationSummaries.mockReset()
        mockFetchConsultationMeRaw.mockReset()
        mockSummarizeConsultationMe.mockReset()
    })

    it('會載入所有摘要並預設顯示最新一筆', async () => {
        mockFetchConsultationSummaries.mockResolvedValue([
            {
                line_id: 'user-1',
                summary_date: '2026-05-26',
                summary: '最新摘要內容',
            },
            {
                line_id: 'user-1',
                summary_date: '2026-05-25',
                summary: '較舊摘要內容',
            },
        ])
        mockFetchConsultationMeRaw.mockResolvedValue({
            view_type: 'raw',
            messages: [],
        })
        mockSummarizeConsultationMe.mockResolvedValue({
            summary: '最新摘要內容',
        })

        render(<ConsultRecordsPage />)

        const select = await screen.findByLabelText('摘要日期')
        expect(select).toHaveValue('2026-05-26')
        expect(screen.getByText('最新摘要內容')).toBeInTheDocument()

        fireEvent.change(select, { target: { value: '2026-05-25' } })

        await waitFor(() => {
            expect(screen.getByText('較舊摘要內容')).toBeInTheDocument()
        })
    })
})

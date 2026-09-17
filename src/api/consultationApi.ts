import type {
    ConsultationSummary,
    ConsultationViewResponse,
} from '../types/consultation'
import i18n from '../i18n'
import { fetchWithAuth } from '../utils/auth'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

export interface ConsultationDownloadTokenResponse {
    downloadToken: string
    expiresIn: number
}

function buildConsultationErrorMessage(status: number, defaultMessage: string) {
    console.error('諮詢紀錄 API 失敗', status)
    if (status === 401) {
        return i18n.t('auth.notLoggedIn')
    }

    // 後端在請求者與目標成員不屬同一家庭族譜時回 403
    if (status === 403) {
        return i18n.t('consultRecord.errorForbidden')
    }

    if (status === 503) {
        return i18n.t('consultRecord.errorDbUnavailable')
    }

    return defaultMessage
}

/**
 * 組出諮詢紀錄的端點路徑。
 *
 * userId 省略時走 `/me/`（本人）；帶入家人的 user_id 則走 `/{userId}/`，
 * 後端會驗證雙方是否在同一家庭族譜，不同家會回 403。
 */
function consultationPath(segment: string, userId?: string): string {
    const owner = userId ? encodeURIComponent(userId) : 'me'
    return `${BASE_URL}/api/consultations/${owner}/${segment}`
}

export async function getAllSummaries(userId?: string): Promise<ConsultationSummary[]> {
    const res = await fetchWithAuth(consultationPath('allsummaries', userId), {
        method: 'GET',
    })

    if (!res.ok) {
        const message = buildConsultationErrorMessage(
            res.status,
            i18n.t('consultRecord.loadSummaryError'),
        )
        throw new Error(message)
    }

    const data = (await res.json()) as ConsultationSummary[]
    return Array.isArray(data)
        ? data.map(summary => ({
            ...summary,
            summary: summary.summary?.trim() || '',
        }))
        : []
}

// 下載相關的兩支端點是本人限定：後端只認 downloadToken 裡的 user id，
// 不接受指定對象，前端在查看家人時也不會顯示下載鈕。
export async function getConsultationSummaryDownloadToken(): Promise<ConsultationDownloadTokenResponse> {
    const res = await fetchWithAuth(`${BASE_URL}/api/consultations/me/summary/downloadtoken`, {
        method: 'GET',
    })

    if (!res.ok) {
        const message = buildConsultationErrorMessage(
            res.status,
            i18n.t('consultRecord.downloadTokenError'),
        )
        throw new Error(message)
    }

    return (await res.json()) as ConsultationDownloadTokenResponse
}

export function buildConsultationSummaryDownloadUrl(downloadToken: string): string {
    return `${BASE_URL}/api/consultations/me/summary/download?downloadToken=${encodeURIComponent(downloadToken)}`
}


//回傳原始訊息
export async function fetchConsultationRaw(userId?: string): Promise<ConsultationViewResponse> {
    const res = await fetchWithAuth(consultationPath('messages/raw', userId), {
        method: 'GET',
    })

    if (!res.ok) {
        const message = buildConsultationErrorMessage(
            res.status,
            i18n.t('consultRecord.loadRawError'),
        )
        throw new Error(message)
    }

    const data = (await res.json()) as ConsultationViewResponse

    // 後端沒有對話時 messages 可能是 null／未帶，補成空陣列讓呼叫端不必再判斷
    return {
        ...data,
        messages: data.messages ?? [],
    }
}

import type {
    ConsultationSummarizePayload,
    ConsultationSummary,
    ConsultationViewResponse,
} from '../types/consultation'
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

function getAuthToken() {
    const token = (localStorage.getItem('CARE_AUTH_TOKEN') || '').trim()
    if (!token) {
        throw new Error('缺少登入憑證，請先重新登入')
    }
    return token
}

function buildAuthHeaders() {
    return {
        Authorization: `Bearer ${getAuthToken()}`,
        // Skip ngrok browser warning when using ngrok
        'ngrok-skip-browser-warning': 'true',
    }
}

function buildConsultationErrorMessage(status: number, defaultMessage: string) {
    if (status === 401) {
        return '登入已失效，請重新登入'
    }

    if (status === 503) {
        return '資料庫暫時不可用，請稍後再試'
    }

    return defaultMessage
}
//優先回傳摘要，沒有就回傳原始訊息
export async function fetchConsultationSummary(): Promise<ConsultationViewResponse> {
    const res = await fetch(`${BASE_URL}/api/consultations/me`, {
        method: 'GET',
        headers: buildAuthHeaders(),
    })

    if (!res.ok) {
        const message = buildConsultationErrorMessage(
            res.status,
            `取得諮詢紀錄失敗：${res.status}`,
        )
        throw new Error(message)
    }
    console.log('fetchConsultationMe response:', res);
    return res.json()
}

//回傳原始訊息
export async function fetchConsultationMeRaw(): Promise<ConsultationViewResponse> {
    const res = await fetch(`${BASE_URL}/api/consultations/me/raw`, {
        method: 'GET',
        headers: buildAuthHeaders(),
    })

    if (!res.ok) {
        const message = buildConsultationErrorMessage(
            res.status,
            `取得原始對話訊息失敗：${res.status}`,
        )
        throw new Error(message)
    }

    return res.json()
}

export async function summarizeConsultationMe(
    payload: ConsultationSummarizePayload = {},
): Promise<ConsultationSummary> {
    const res = await fetch(`${BASE_URL}/api/consultations/me/summarize`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...buildAuthHeaders(),
        },
        body: JSON.stringify(payload),
    })

    if (!res.ok) {
        if (res.status === 422) {
            throw new Error('日期格式不合法')
        }

        if (res.status === 429) {
            throw new Error('AI 額度已達上限，請稍後再試')
        }

        if (res.status === 502) {
            throw new Error('AI 服務異常')
        }

        const message = buildConsultationErrorMessage(
            res.status,
            `產生諮詢摘要失敗：${res.status}`,
        )
        throw new Error(message)
    }

    return res.json()
}
import { authHeaders } from '../utils/auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

export type UpsertPersonalHealthPayload = {
    name: string
    gender: string
    height: number
    weight: number
    age: number
    chronic_history: string
    major_illness_history: string
    surgery_history: string
    health_consultations: Record<string, unknown>
}

/** 後端回傳的個人健康檔案（所有欄位可能為空） */
export type HealthProfile = {
    name?: string
    gender?: string
    height?: number
    weight?: number
    age?: number
    chronic_history?: string
    major_illness_history?: string
    surgery_history?: string
    health_consultations?: Record<string, unknown>
}

export async function upsertPersonalHealthProfile(
    userId: string,
    payload: UpsertPersonalHealthPayload,
) {
    const res = await fetch(`${BASE_URL}/profiles/${userId}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
    })

    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`個人資料儲存失敗：${res.status}${text ? ` - ${text}` : ''}`)
    }

    return res.json()
}

export async function getPersonalHealthProfile(userId: string): Promise<HealthProfile> {
    const res = await fetch(`${BASE_URL}/profiles/${userId}`, {
        method: 'GET',
        headers: authHeaders(),
    })

    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`取得個人資料失敗：${res.status}${text ? ` - ${text}` : ''}`)
    }

    return res.json()
}

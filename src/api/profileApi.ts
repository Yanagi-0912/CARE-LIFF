import { authHeaders } from '../utils/auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

type ValidationErrorDetail = {
    loc?: Array<string | number>
    msg?: string
}

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
    payload: UpsertPersonalHealthPayload,
) {
    const token = (localStorage.getItem('CARE_AUTH_TOKEN') || '').trim()
    if (!token) {
        throw new Error('缺少登入憑證，請先重新登入')
    }
    //注意呼叫API要加上"api"前綴
    const res = await fetch(`${BASE_URL}/api/profiles/me/update`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            // 這個 header 是為了跳過 ngrok 的瀏覽器警告頁面，確保在 ngrok 環境下也能正常取得 API 回應
            'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify(payload),
    })
    // 針對 422 Unprocessable Entity 錯誤，嘗試解析後端回傳的驗證錯誤訊息，
    // 並提供更具體的錯誤提示


    if (!res.ok) {
        const text = await res.text().catch(() => '')
        if (res.status === 422 && text) {

            let body: { detail?: ValidationErrorDetail[] }
            // 先把 422 回應轉成 JSON，才能取出欄位驗證資訊
            try {
                body = JSON.parse(text)
            }

            catch (error) {
                // 只有 JSON 解析失敗才改回泛用錯誤，其它例外直接往外拋
                if (error instanceof SyntaxError) {
                    // 改寫${res.status}${text ? ` - ${text}` : ''}`原本寫法以提高可讀性
                    const errorMessage = text ? ` : ${text}` : ''
                    throw new Error(
                        `個人資料儲存失敗：${res.status}${errorMessage}`,
                    )
                }

                throw error
            }

            const firstDetail = body.detail?.[0]

            const loc = firstDetail?.loc

            const fieldKey = loc?.[loc.length - 1]

            let fieldLabel: string | undefined
            //把後端回傳的英文欄位名稱轉成前端顯示給使用者的中文名稱。
            if (fieldKey === 'age') {
                fieldLabel = '年齡'
            } else if (fieldKey === 'height') {
                fieldLabel = '身高'
            } else if (fieldKey === 'weight') {
                fieldLabel = '體重'
            } else if (fieldKey === 'name') {
                fieldLabel = '姓名'
            } else if (fieldKey === 'gender') {
                fieldLabel = '性別'
            }

            const detailMessage = firstDetail?.msg || '資料格式不正確'
            // 如果能從後端回傳的驗證錯誤中解析出具體的欄位資訊，就顯示更明確的錯誤訊息；
            // 否則就顯示泛用的錯誤提示
            throw new Error(
                fieldLabel
                    ? `個人資料欄位驗證失敗（${fieldLabel}）：${detailMessage}`
                    : `個人資料欄位驗證失敗：${detailMessage}`,
            )
        }

        const errorDetail = text ? ' - ' + text : ''
        throw new Error('個人資料儲存失敗：' + res.status + errorDetail)
    }

    return res.json()
}

export async function getPersonalHealthProfile() {
    const token = (localStorage.getItem('CARE_AUTH_TOKEN') || '').trim()
    if (!token) {
        throw new Error('缺少登入憑證，請先重新登入')
    }

    const res = await fetch(`${BASE_URL}/api/profiles/me`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            // 這個 header 是為了跳過 ngrok 的瀏覽器警告頁面，確保在 ngrok 環境下也能正常取得 API 回應
            'ngrok-skip-browser-warning': 'true',
        },
    })

    // 404 代表使用者還沒有保存過資料，返回 null 讓前端繼續使用預設值
    if (res.status === 404) {
        return null
    }

    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`取得個人資料失敗：${res.status}${text ? ` - ${text}` : ''}`)
    }

    return res.json()
}

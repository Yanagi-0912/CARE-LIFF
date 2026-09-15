import i18n from '../i18n'
import { fetchWithAuth } from '../utils/auth'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

type ValidationErrorDetail = {
    loc?: Array<string | number>
    msg?: string
}

/* 慢性病拆成兩欄而非一個「、」串起來的字串：固定選項要依讀者的語言翻譯，
 * 自行輸入的病名必須原文照留。混在同一個字串裡就分不出哪個是哪個。 */
export type UpsertPersonalHealthPayload = {
    name: string
    /** 與 i18n key 的最後一段同名的 code */
    gender: string
    height: number
    weight: number
    age: number
    /** 固定選項的 code，例如 hypertension */
    chronic_diseases: string[]
    /** 使用者自行輸入的病名，原文照送 */
    chronic_custom: string[]
    /** 空字串代表沒有 */
    major_illness_history: string
    /** 空字串代表沒有 */
    surgery_history: string
    health_consultations: Record<string, unknown>
}

/** 後端回傳的個人健康檔案（所有欄位可能為空）
 *
 * age／height／weight 沒填過時是 null。舊資料可能還留著建帳號時的佔位值
 * （age 0、height 1、weight 1），所以讀進表單或畫面一律經過
 * `pages/PersonalHealth/healthForm.ts` 的 profileToFormValues，不要各自判斷。
 */
export type HealthProfile = {
    name?: string
    gender?: string
    height?: number | null
    weight?: number | null
    age?: number | null
    chronic_diseases?: string[]
    chronic_custom?: string[]
    major_illness_history?: string
    surgery_history?: string
    health_consultations?: Record<string, unknown>
    role?: 'admin' | 'user'
}

/** 422 回報的欄位名 → 表單上同一個欄位的標籤（i18n key），錯誤訊息才對得上畫面 */
const VALIDATION_FIELD_LABEL_KEY: Record<string, string> = {
    age: 'personalHealth.age',
    height: 'personalHealth.height',
    weight: 'personalHealth.weight',
    name: 'personalHealth.name',
    gender: 'personalHealth.gender',
}

export async function upsertPersonalHealthProfile(
    payload: UpsertPersonalHealthPayload,
) {
    const res = await fetchWithAuth(`${BASE_URL}/api/profiles/me/update`, {
        method: 'PUT',
        body: JSON.stringify(payload),
    })

    if (!res.ok) {
        const text = await res.text().catch(() => '')
        // 狀態碼與後端原文留給 console；畫面上只講使用者看得懂的一句話
        console.error('個人資料儲存失敗', res.status, text)
        if (res.status === 422 && text) {
            let body: { detail?: ValidationErrorDetail[] } | null = null
            try {
                body = JSON.parse(text)
            } catch {
                body = null
            }
            const loc = body?.detail?.[0]?.loc
            const fieldKey = loc?.[loc.length - 1]
            const fieldLabelKey =
                typeof fieldKey === 'string' ? VALIDATION_FIELD_LABEL_KEY[fieldKey] : undefined
            throw new Error(
                fieldLabelKey
                    ? i18n.t('personalHealth.validationFailedField', { field: i18n.t(fieldLabelKey) })
                    : i18n.t('personalHealth.validationFailed'),
            )
        }
        throw new Error(i18n.t('personalHealth.saveError'))
    }

    return res.json()
}

/** 404（還沒建檔）回 null；其他錯誤丟出去，讓呼叫端分得出「沒資料」與「讀不到」 */
export async function getPersonalHealthProfile(userId?: string): Promise<HealthProfile | null> {
    const url = userId
        ? `${BASE_URL}/api/profiles/${encodeURIComponent(userId)}`
        : `${BASE_URL}/api/profiles/me`

    const res = await fetchWithAuth(url, {
        method: 'GET',
    })

    if (res.status === 404) {
        return null
    }

    if (!res.ok) {
        const text = await res.text().catch(() => '')
        console.error('取得個人資料失敗', res.status, text)
        throw new Error(i18n.t('personalHealth.loadError'))
    }

    return res.json()
}


/**
 * 代為更新指定使用者的健康資料（GUARDIAN 用）。
 *
 * 需要對該使用者的 SENSITIVE 具備寫入權；CAREGIVER 僅有讀取權，呼叫會得到
 * 403。顯示名稱與頭像**不在這條路徑的可寫範圍內**——後端會剝除並在
 * `skipped_fields` 回報，介面因此不提供那兩個欄位的編輯。
 *
 * 型別刻意排除 `name`：那個欄位不歸這條路徑管，送過去只會被剝除。把它留在
 * 型別裡曾經害這支 API 一路送出讀回來的舊值——而代填讀到的可能是空字串，
 * 於是撞上後端的必填驗證。少一個欄位，那個情境就不存在。
 */
export async function proxyUpsertHealthProfile(
    userId: string,
    payload: Omit<UpsertPersonalHealthPayload, 'name'>,
) {
    const res = await fetchWithAuth(
        `${BASE_URL}/api/profiles/${encodeURIComponent(userId)}`,
        {
            method: 'PUT',
            body: JSON.stringify(payload),
        },
    )

    if (!res.ok) {
        const text = await res.text().catch(() => '')
        console.error('代填健康資料失敗', res.status, text)
        throw new Error(
            i18n.t(res.status === 403 ? 'familyPermission.proxyEditForbidden' : 'familyPermission.proxyEditError'),
        )
    }

    return res.json() as Promise<{
        user_id: string
        updated: boolean
        skipped_fields: string[]
    }>
}

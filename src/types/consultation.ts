export type ConsultationMessage = {
    role?: string
    message_type?: string
    type?: string
    sender?: string
    text?: string
    message?: string
    content?: string
    [key: string]: unknown
}

export type ConsultationViewType = 'summary' | 'raw'

//對應後端的 ConsultationViewResponse。
//欄位依 view_type 而定（summary 版給摘要、raw 版給原始訊息），故皆為 optional。

export type ConsultationViewResponse = {
    line_id?: string
    view_type?: ConsultationViewType
    summary?: string
    language?: string
    messages?: ConsultationMessage[]
}

export type ConsultationSummary = {
    line_id?: string
    summary?: string
    summary_date?: string
    created_at?: string
    target_date?: string
    [key: string]: unknown
}

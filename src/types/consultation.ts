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

export type ConsultationViewResponse = {
    view_type?: ConsultationViewType
    summary?: string
    consultation_summary?: string
    content?: string
    messages?: ConsultationMessage[]
    conversation?: ConsultationMessage[]
    records?: ConsultationMessage[]
    data?: {
        summary?: string
        consultation_summary?: string
        messages?: ConsultationMessage[]
        conversation?: ConsultationMessage[]
        records?: ConsultationMessage[]
    }
}

export type ConsultationSummary = {
    summary?: string
    target_date?: string
    [key: string]: unknown
}

export type ConsultationSummarizePayload = {
    target_date?: string
    force?: boolean
}

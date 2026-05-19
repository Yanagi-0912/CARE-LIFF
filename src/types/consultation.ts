export type ConsultationMessage = {
    role?: string
    content?: string
    [key: string]: unknown
}

export type ConsultationViewType = 'summary' | 'raw'

export type ConsultationViewResponse = {
    view_type: ConsultationViewType
    summary?: string
    messages?: ConsultationMessage[]
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

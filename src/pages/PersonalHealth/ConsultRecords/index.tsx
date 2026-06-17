import React, { useState, useEffect } from 'react';
import liff from '@line/liff';
import {
    getAllSummaries,
    fetchConsultationMeRaw,
    getConsultationSummaryDownloadToken,
    buildConsultationSummaryDownloadUrl,
    summarizeConsultationMe,
} from '../../../api/consultationApi';
import './index.css';
import ReactMarkdown from 'react-markdown';
import type { ConsultationMessage, ConsultationSummary } from '../../../types/consultation';

interface ConsultRecord {
    id: string;
    userMessage: string;
    aiReply: string;
    summary: string;
    timestamp: number;
}

type SummaryValue = string | string[] | null;

type SummarySection = {
    key: string;
    label: string;
    value: SummaryValue;
};

type DownloadToastState = {
    status: 'success' | 'error';
    message: string;
} | null;

type SummaryToastState = {
    status: 'success' | 'error';
    message: string;
} | null;

const LOCAL_KEY = 'consult_records';
const DAY_MS = 24 * 60 * 60 * 1000;

function getSummaryKey(summary: ConsultationSummary): string {
    return summary.summary_date || summary.target_date || summary.created_at || '';
}

function formatSummaryDate(summary: ConsultationSummary): string {
    const rawDate = summary.summary_date || summary.target_date || summary.created_at || '';
    if (!rawDate) {
        return '未命名日期';
    }

    const datePart = rawDate.slice(0, 10);
    return datePart.replace(/-/g, '/');
}

function trimSummaryText(summary: ConsultationSummary): string {
    return summary.summary?.trim() || '目前沒有摘要內容';
}

function getSummarySource(summary: ConsultationSummary): unknown {
    return summary.summary;
}

function parseSummaryContent(summary: ConsultationSummary): Record<string, unknown> | null {
    const source = getSummarySource(summary);

    if (source && typeof source === 'object' && !Array.isArray(source)) {
        return source as Record<string, unknown>;
    }

    if (typeof source !== 'string') {
        return null;
    }

    const trimmed = source.trim();
    if (!trimmed) {
        return null;
    }

    try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    }
    catch {
        return null;
    }

    return null;
}

function stringifySummaryValue(value: unknown): string {
    if (value === null || value === undefined) {
        return '無';
    }

    if (Array.isArray(value)) {
        return value.length > 0 ? value.map(item => `- ${String(item)}`).join('\n') : '無';
    }

    if (typeof value === 'object') {
        return JSON.stringify(value, null, 2);
    }

    return String(value).trim() || '無';
}

function toSummarySections(summary: ConsultationSummary): SummarySection[] {
    const content = parseSummaryContent(summary);

    if (!content) {
        const fallback = trimSummaryText(summary);
        return fallback
            ? [{ key: 'summary', label: '摘要內容', value: fallback }]
            : [];
    }

    return Object.entries(content)
        .map(([key, rawValue]) => ({
            key,
            label: key,
            value: Array.isArray(rawValue)
                ? (rawValue as string[])
                : stringifySummaryValue(rawValue),
        }))
        .filter(section => {
            if (Array.isArray(section.value)) {
                return section.value.length > 0;
            }

            return String(section.value ?? '').trim().length > 0;
        });
}

function saveRecords(records: ConsultRecord[]) {
    try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(records));
    }
    catch {
        console.error('Failed to save consult records');
    }
}

function loadRecords(): ConsultRecord[] {
    try {
        const raw = localStorage.getItem(LOCAL_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    }
    catch {
        console.error('Failed to load consult records');
        return [];
    }
}

const ConsultRecordsPage: React.FC = () => {
    const [records, setRecords] = useState<ConsultRecord[]>([]);
    const [summaryItems, setSummaryItems] = useState<ConsultationSummary[]>([]);
    const [selectedSummaryKey, setSelectedSummaryKey] = useState<string>('');
    const [rawMessages, setRawMessages] = useState<ConsultationMessage[]>([]);
    const hasRawMessages = rawMessages.length > 0;

    const [viewMode, setViewMode] = useState<'summary' | 'raw'>('summary');
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summaryActionLoading, setSummaryActionLoading] = useState(false);
    const [downloadLoading, setDownloadLoading] = useState(false);
    const [summaryError, setSummaryError] = useState<string | null>(null);
    const [downloadToast, setDownloadToast] = useState<DownloadToastState>(null);
    const [summaryToast, setSummaryToast] = useState<SummaryToastState>(null);
    //顯示詳細對話內容
    const [selectedMessage, setSelectedMessage] = useState<ConsultationMessage | null>(null);
    const selectedSummary =
        summaryItems.find(item => getSummaryKey(item) === selectedSummaryKey) ||
        summaryItems[0] ||
        null;

    const selectedSummarySections = selectedSummary ? toSummarySections(selectedSummary) : [];

    const truncateText = (text: string, maxLength: number = 100): string => {
        if (!text) return '（無內容）';
        return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
    };

    const loadSummary = async (preserveSelection: boolean = true) => {
        setSummaryLoading(true);
        setSummaryError(null);
        try {
            const [summariesResult, rawResult] = await Promise.allSettled([
                getAllSummaries(),
                fetchConsultationMeRaw(),
            ]);

            if (summariesResult.status === 'fulfilled') {
                const summaries = summariesResult.value;
                setSummaryItems(summaries);

                const firstKey = getSummaryKey(summaries[0] || {} as ConsultationSummary);
                setSelectedSummaryKey(previousKey => {
                    if (!preserveSelection) {
                        return firstKey;
                    }

                    if (previousKey && summaries.some(item => getSummaryKey(item) === previousKey)) {
                        return previousKey;
                    }

                    return firstKey;
                });

                if (summaries.length > 0) {
                    setViewMode('summary');
                }
            } else {
                setSummaryItems([]);
                setSelectedSummaryKey('');
                setSummaryError(
                    summariesResult.reason instanceof Error
                        ? summariesResult.reason.message
                        : '取得摘要清單失敗',
                );
            }

            if (rawResult.status === 'fulfilled') {
                const rawData = rawResult.value;
                const messages = rawData.messages ?? [];
                setRawMessages(messages);
                if (summariesResult.status !== 'fulfilled' && messages.length > 0) {
                    setViewMode('raw');
                }
            } else {
                console.warn('Failed to fetch raw consultation messages', rawResult.reason);
                setRawMessages([]);
            }
        }
        catch (error) {
            setSummaryItems([]);
            setSelectedSummaryKey('');
            setRawMessages([]);
            setSummaryError(error instanceof Error ? error.message : '取得摘要失敗');
        }
        finally {
            setSummaryLoading(false);
        }
    };

    useEffect(() => {
        loadSummary();
        const now = Date.now();
        const all = loadRecords();
        const filtered = all.filter(r => now - r.timestamp < 7 * DAY_MS);
        setRecords(filtered);
        if (filtered.length !== all.length) saveRecords(filtered);
    }, []);

    useEffect(() => {
        if (!downloadToast) {
            return;
        }

        const timer = window.setTimeout(() => {
            setDownloadToast(null);
        }, 3000);

        return () => window.clearTimeout(timer);
    }, [downloadToast]);

    useEffect(() => {
        if (!summaryToast) {
            return;
        }

        const timer = window.setTimeout(() => {
            setSummaryToast(null);
        }, 3000);

        return () => window.clearTimeout(timer);
    }, [summaryToast]);

    const handleSummarizeNow = async () => {
        setSummaryActionLoading(true);
        setSummaryToast(null);
        try {
            const result = await summarizeConsultationMe({ force: true });
            const newSummary = result.summary?.trim() || null;
            await loadSummary(false);
            setViewMode('summary');

            if (newSummary) {
                const newRecord: ConsultRecord = {
                    id: Date.now().toString(),
                    userMessage: '本次健康諮詢摘要',
                    aiReply: '已產生摘要',
                    summary: newSummary,
                    timestamp: Date.now(),
                };
                const updated = [newRecord, ...records];
                setRecords(updated);
                saveRecords(updated);
            }

            setSummaryToast({
                status: newSummary ? 'success' : 'error',
                message: newSummary ? '摘要已成功產生' : '摘要已產生，但目前沒有可顯示的內容',
            });
        }
        catch (error) {
            setSummaryToast({
                status: 'error',
                message: error instanceof Error ? error.message : '產生摘要失敗',
            });
        }
        finally {
            setSummaryActionLoading(false);
        }
    };

    const handleDownload = async () => {
        setDownloadLoading(true);
        setDownloadToast(null);

        try {
            const tokenResult = await getConsultationSummaryDownloadToken();
            const downloadUrl = buildConsultationSummaryDownloadUrl(tokenResult.downloadToken);
            // isInClient確認是否在LINE內建瀏覽器，false表示在外部瀏覽器
            if (liff.isInClient()) {
                liff.openWindow({ url: downloadUrl, external: true });
                setDownloadToast({
                    status: 'success',
                    message: '下載連結已在外部瀏覽器開啟',
                });
                return;
            }
            // 電腦版
            window.location.href = downloadUrl;
        }
        catch (error) {
            setDownloadToast({
                status: 'error',
                message: error instanceof Error ? error.message : '下載摘要失敗',
            });
        }
        finally {
            setDownloadLoading(false);
        }
    };

    return (
        <div className="consult-page">
            {summaryToast && (
                <div className={`saveToast ${summaryToast.status === 'success' ? 'saveToastSuccess' : 'saveToastError'}`}>
                    {summaryToast.message}
                </div>
            )}
            {downloadToast && (
                <div className={`saveToast ${downloadToast.status === 'success' ? 'saveToastSuccess' : 'saveToastError'}`}>
                    {downloadToast.message}
                </div>
            )}
            <header className="consult-header">
                <h2>健康諮詢紀錄</h2>
                <p>保存並顯示當天的對話，並以 AI 摘要整理重點，摘要將保存七天。</p>
            </header>
            <section className="consult-card">
                <div className="panel">
                    <div className="panel-top">
                        <div className="panel-time">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        <div className="panel-notch">
                            <div className="panel-dot" />
                            <div className="panel-speaker" />
                            <div className="panel-dot" />
                        </div>
                        <div className="panel-status">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="iconOnPhone">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" />
                            </svg>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="iconOnPhone">
                                <path fillRule="evenodd" d="M3.75 6.75a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3v-.037c.856-.174 1.5-.93 1.5-1.838v-2.25c0-.907-.644-1.664-1.5-1.837V9.75a3 3 0 0 0-3-3h-15Zm15 1.5a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-15a1.5 1.5 0 0 1-1.5-1.5v-6a1.5 1.5 0 0 1 1.5-1.5h15ZM4.5 9.75a.75.75 0 0 0-.75.75V15c0 .414.336.75.75.75H18a.75.75 0 0 0 .75-.75v-4.5a.75.75 0 0 0-.75-.75H4.5Z" clipRule="evenodd" />
                            </svg>
                        </div>

                        <div className="panel-controls" role="tablist" aria-label="諮詢畫面切換">
                            <button
                                type="button"
                                className={`summaryBtn ${viewMode === 'summary' ? 'active' : ''}`}
                                onClick={() => setViewMode('summary')}
                                aria-pressed={viewMode === 'summary'}
                            >
                                摘要
                            </button>
                            <button
                                type="button"
                                className={`rawMsgBtn ${viewMode === 'raw' ? 'active' : ''}`}
                                onClick={() => setViewMode('raw')}
                                aria-pressed={viewMode === 'raw'}
                            >
                                對話
                            </button>
                        </div>
                    </div>

                    <div className="panel-list">
                        {summaryLoading && (
                            <div className="panel-item is-muted">
                                <div className="panel-badge">AI</div>
                                <p>資料載入中...</p>
                            </div>
                        )}

                        {!summaryLoading && summaryError && (
                            <div className="panel-item is-error">
                                <div className="panel-badge">AI</div>
                                <p>{summaryError}</p>
                            </div>
                        )}

                        {!summaryLoading && (
                            <>
                                {viewMode === 'summary' && (
                                    summaryItems.length > 0 ? (
                                        <>
                                            <div className="panel-item compact">
                                                <div className="compact-header">

                                                    <label className="summary-label" htmlFor="summary-select">
                                                        摘要日期
                                                    </label>
                                                    <select
                                                        id="summary-select"
                                                        className="summary-select"
                                                        value={selectedSummaryKey}
                                                        onChange={event => setSelectedSummaryKey(event.target.value)}
                                                    >
                                                        {summaryItems.map(summary => {
                                                            const summaryKey = getSummaryKey(summary);
                                                            return (
                                                                <option key={summaryKey} value={summaryKey}>
                                                                    {formatSummaryDate(summary)}
                                                                </option>
                                                            );
                                                        })}
                                                    </select>
                                                </div>

                                                <div className="summary-viewer compact-body">
                                                    <div className="summary-title">醫療諮詢紀錄摘要</div>
                                                    {selectedSummarySections.length > 0 ? (
                                                        selectedSummarySections.map(section => (
                                                            <section key={section.key} className="summary-section">
                                                                <div className="summary-section-title">{section.label}</div>
                                                                <div className="summary-section-body markdown-content">
                                                                    <ReactMarkdown>
                                                                        {Array.isArray(section.value)
                                                                            ? section.value.map(item => `- ${item}`).join('\n')
                                                                            : section.value ?? '無'}
                                                                    </ReactMarkdown>
                                                                </div>
                                                            </section>
                                                        ))
                                                    ) : (
                                                        <div className="summary-empty">目前沒有摘要內容</div>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="panel-item is-empty">
                                            <div className="panel-badge">AI</div>
                                            <p>目前沒有摘要資料，請點「立即產生摘要」建立摘要。</p>
                                        </div>
                                    )
                                )}

                                {viewMode === 'raw' && (
                                    // 2. raw 訊息列表加上 onClick（取代原本 hasRawMessages ? rawMessages.map(...) 這段）
                                    hasRawMessages ? (
                                        rawMessages.map((message, index) => {
                                            const isYou = message.message_type === 'text';
                                            return (
                                                <div
                                                    key={`raw_${index}`}
                                                    className={`chat-row ${isYou ? 'user' : 'ai'}`}
                                                    onClick={() => setSelectedMessage(message)}
                                                    role="button"
                                                    tabIndex={0}
                                                    onKeyDown={event => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            setSelectedMessage(message);
                                                        }
                                                    }}
                                                >
                                                    <div className={`panel-badge ${isYou ? 'user-badge' : 'ai-badge'}`}>
                                                        {isYou ? '你' : 'AI'}
                                                    </div>
                                                    <div className={`chat-bubble ${isYou ? 'user-bubble' : 'ai-bubble'}`}>
                                                        {truncateText(message.content || "", 50)}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="panel-item is-empty">
                                            <div className="panel-badge">AI</div>
                                            <p>目前沒有對話紀錄。</p>
                                        </div>
                                    )
                                )}
                            </>
                        )}
                    </div>
                </div>
                <div className="form-actions">
                    <button
                        onClick={handleSummarizeNow}
                        className="btn primary"
                        disabled={summaryActionLoading}
                    >
                        {summaryActionLoading ? '摘要產生中...' : '立即產生摘要'}
                    </button>
                    <button onClick={handleDownload} className="btn ghost" disabled={downloadLoading}>
                        {downloadLoading ? '下載準備中...' : '下載所有紀錄（JSON）'}
                    </button>
                </div>
            </section>
            {/* Modal 區塊，放在 return 的最後面 */}
            {selectedMessage && (
                <div className="modal-overlay" onClick={() => setSelectedMessage(null)}>
                    <div className="modal-content" onClick={event => event.stopPropagation()}>
                        <button
                            type="button"
                            className="modal-close"
                            aria-label="關閉視窗"
                            onClick={() => setSelectedMessage(null)}
                        >
                            ×
                        </button>

                        <div className={`modal-header ${selectedMessage.message_type === 'text' ? 'is-user' : 'is-ai'}`}>
                            <div className="modal-avatar">
                                {selectedMessage.message_type === 'text' ? '你' : 'AI'}
                            </div>
                            <h3 className="modal-title">
                                {selectedMessage.message_type === 'text' ? '你的訊息' : 'AI 回覆'}
                            </h3>
                        </div>

                        <div className="modal-body markdown-content">
                            <ReactMarkdown>{selectedMessage.content || '（無內容）'}</ReactMarkdown>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConsultRecordsPage;
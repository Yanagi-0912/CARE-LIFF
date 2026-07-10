import React, { useState, useEffect } from 'react';
import liff from '@line/liff';
import ReactMarkdown from 'react-markdown';
import {
    getAllSummaries,
    fetchConsultationMeRaw,
    getConsultationSummaryDownloadToken,
    buildConsultationSummaryDownloadUrl,
} from '../../../api/consultationApi';
import './index.css';
import type { ConsultationMessage, ConsultationSummary } from '../../../types/consultation';

type SummarySection = { key: string; label: string; value: string | string[] | null };
type ToastState = { status: 'success' | 'error'; message: string } | null;

function useAutoClose<T>(value: T, setter: (v: null) => void) {
    useEffect(() => {
        if (!value) return;
        const timer = setTimeout(() => setter(null), 3000);
        return () => clearTimeout(timer);
    }, [value, setter]);
}

const truncateText = (text: string) => {
    if (!text)
        return '（無內容）';
    if (text.length > 50)
        return `${text.slice(0, 50)}...`;
    return text;
};
const getSummaryKey = (s: ConsultationSummary) => s?.summary_date ?? '';
const formatSummaryDate = (s: ConsultationSummary) =>
    getSummaryKey(s).slice(0, 10).replaceAll('-', '/') || '未命名日期';

function toSummarySections(summary: ConsultationSummary): SummarySection[] {
    const source = summary.summary;
    let content: Record<string, unknown> | null = null;

    if (source && typeof source === 'object' && !Array.isArray(source)) {
        content = source as Record<string, unknown>;
    }
    else if (typeof source === 'string' && source.trim()) {
        try {
            const parsed = JSON.parse(source.trim());
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                content = parsed;
            }
        }
        catch {
            console.warn('無法解析摘要內容為 JSON，將以原始字串顯示');
        }
    }

    if (!content) return source?.trim() ? [{ key: 'summary', label: '摘要內容', value: source.trim() }] : [];

    return Object.entries(content)
        .map(([key, val]) => {
            let finalValue: string | string[];

            if (Array.isArray(val)) {
                finalValue = val as string[];
            } else if (val === null || val === undefined) {
                finalValue = '無';
            } else if (typeof val === 'object') {
                finalValue = JSON.stringify(val, null, 2);
            } else {
                finalValue = String(val).trim() || '無';
            }

            return {
                key,
                label: key,
                value: finalValue
            };
        })
        .filter(s => {
            if (Array.isArray(s.value)) {
                return s.value.length > 0; // 陣列有內容才留下
            }
            const textValue = String(s.value ?? '').trim();
            return textValue.length > 0 && textValue !== '無'; // 有效文字才留下
        });
}

const ConsultRecordsPage: React.FC = () => {
    const [summaryItems, setSummaryItems] = useState<ConsultationSummary[]>([]);
    const [selectedSummaryKey, setSelectedSummaryKey] = useState<string>('');
    const [rawMessages, setRawMessages] = useState<ConsultationMessage[]>([]);
    const [viewMode, setViewMode] = useState<'summary' | 'raw'>('summary');
    const [loading, setLoading] = useState({ list: false, action: false, download: false });
    const [summaryError, setSummaryError] = useState<string | null>(null);
    const [toast, setToast] = useState<ToastState>(null);
    const [selectedMessage, setSelectedMessage] = useState<ConsultationMessage | null>(null);

    const selectedSummary = summaryItems.find(item => getSummaryKey(item) === selectedSummaryKey) || summaryItems[0] || null;
    const selectedSummarySections = selectedSummary ? toSummarySections(selectedSummary) : [];

    useAutoClose(toast, setToast);

    const loadSummary = async (preserveSelection = true) => {
        setLoading(prev => ({ ...prev, list: true }));
        setSummaryError(null);
        try {
            const [summariesResult, rawResult] = await Promise.allSettled([getAllSummaries(), fetchConsultationMeRaw()]);

            if (summariesResult.status === 'fulfilled') {
                const summaries = summariesResult.value;
                setSummaryItems(summaries);
                setSelectedSummaryKey(prevKey => {
                    const isPrevKeyValid = preserveSelection && prevKey && summaries.some(i => getSummaryKey(i) === prevKey);
                    if (isPrevKeyValid) {
                        return prevKey;
                    }
                    return getSummaryKey(summaries[0] || {});
                });

                if (summaries.length > 0) {
                    setViewMode('summary');
                }
            } else {
                setSummaryItems([]); setSelectedSummaryKey('');
                setSummaryError(summariesResult.reason instanceof Error ? summariesResult.reason.message : '取得摘要清單失敗');
            }

            if (rawResult.status === 'fulfilled') {
                const messages = rawResult.value.messages ?? [];
                setRawMessages(messages);
                if (summariesResult.status !== 'fulfilled' && messages.length > 0) {
                    setViewMode('raw');
                }
            } else {
                setRawMessages([]);
            }
        } catch (error) {
            setSummaryItems([]); setSelectedSummaryKey(''); setRawMessages([]);
            setSummaryError(error instanceof Error ? error.message : '取得摘要失敗');
        } finally {
            setLoading(prev => ({ ...prev, list: false }));
        }
    };

    useEffect(() => { loadSummary(); }, []);

    const handleDownload = async () => {
        setLoading(prev => ({ ...prev, download: true })); setToast(null);
        try {
            const tokenResult = await getConsultationSummaryDownloadToken();
            const downloadUrl = buildConsultationSummaryDownloadUrl(tokenResult.downloadToken);
            if (liff.isInClient()) {
                liff.openWindow({ url: downloadUrl, external: true });
                setToast({ status: 'success', message: '下載連結已在外部瀏覽器開啟' });
            } else {
                globalThis.location.href = downloadUrl;
            }
        } catch (error) {
            setToast({ status: 'error', message: error instanceof Error ? error.message : '下載摘要失敗' });
        } finally {
            setLoading(prev => ({ ...prev, download: false }));
        }
    };

    return (
        <div className="consult-page">
            {toast && <div className={`saveToast ${toast.status === 'success' ? 'saveToastSuccess' : 'saveToastError'}`}>{toast.message}</div>}

            <header className="consult-header">
                <h2>健康諮詢紀錄</h2>
                <p>保存並顯示24小時內的對話，並定時以 AI 摘要整理重點，摘要至多保存20筆。</p>
            </header>

            <section className="consult-card">
                <div className="panel">
                    <div className="panel-top">
                        <div className="panel-time">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        <div className="panel-notch"><div className="panel-dot" /><div className="panel-speaker" /><div className="panel-dot" /></div>
                        <div className="panel-status">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="iconOnPhone"><path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" /></svg>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="iconOnPhone"><path fillRule="evenodd" d="M3.75 6.75a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3v-.037c.856-.174 1.5-.93 1.5-1.838v-2.25c0-.907-.644-1.664-1.5-1.837V9.75a3 3 0 0 0-3-3h-15Zm15 1.5a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-15a1.5 1.5 0 0 1-1.5-1.5v-6a1.5 1.5 0 0 1 1.5-1.5h15ZM4.5 9.75a.75.75 0 0 0-.75.75V15c0 .414.336.75.75.75H18a.75.75 0 0 0 .75-.75v-4.5a.75.75 0 0 0-.75-.75H4.5Z" clipRule="evenodd" /></svg>
                        </div>
                        <div className="panel-controls" role="tablist" aria-label="諮詢畫面切換">
                            <button type="button" className={`summaryBtn ${viewMode === 'summary' ? 'active' : ''}`} onClick={() => setViewMode('summary')} aria-pressed={viewMode === 'summary'}>摘要</button>
                            <button type="button" className={`rawMsgBtn ${viewMode === 'raw' ? 'active' : ''}`} onClick={() => setViewMode('raw')} aria-pressed={viewMode === 'raw'}>對話</button>
                        </div>
                    </div>

                    <div className="panel-list">
                        {loading.list && <div className="panel-item is-muted"><div className="panel-badge">AI</div><p>資料載入中...</p></div>}
                        {!loading.list && summaryError && <div className="panel-item is-error"><div className="panel-badge">AI</div><p>{summaryError}</p></div>}
                        {!loading.list && (
                            <>
                                {viewMode === 'summary' && (
                                    summaryItems.length > 0 ? (
                                        <div className="panel-item compact">
                                            <div className="compact-header">
                                                <label className="summary-label" htmlFor="summary-select">摘要日期</label>
                                                <select id="summary-select" className="summary-select" value={selectedSummaryKey} onChange={e => setSelectedSummaryKey(e.target.value)}>
                                                    {summaryItems.map(s => <option key={getSummaryKey(s)} value={getSummaryKey(s)}>{formatSummaryDate(s)}</option>)}
                                                </select>
                                            </div>
                                            <div className="summary-viewer compact-body">
                                                <div className="summary-title">醫療諮詢紀錄摘要</div>
                                                {selectedSummarySections.length > 0 ? selectedSummarySections.map(section => (
                                                    <section key={section.key} className="summary-section">
                                                        <div className="summary-section-title">{section.label}</div>
                                                        <div className="summary-section-body markdown-content">
                                                            <ReactMarkdown>{Array.isArray(section.value) ? section.value.map(item => `- ${item}`).join('\n') : section.value ?? '無'}</ReactMarkdown>
                                                        </div>
                                                    </section>
                                                )) : <div className="summary-empty">目前沒有摘要內容</div>}
                                            </div>
                                        </div>
                                    ) : <div className="panel-item is-empty"><div className="panel-badge">AI</div><p>目前沒有摘要資料，請點「立即產生摘要」建立摘要。</p></div>
                                )}
                                {viewMode === 'raw' && (
                                    rawMessages.length > 0 ? rawMessages.map((msg, idx) => {
                                        const isYou = msg.message_type === 'text';
                                        return (
                                            <div
                                                key={`raw_${idx}`}
                                                className={`chat-row ${isYou ? 'user' : 'ai'}`}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => setSelectedMessage(msg)}
                                                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setSelectedMessage(msg)}
                                            >
                                                <div className={`panel-badge ${isYou ? 'user-badge' : 'ai-badge'}`}>
                                                    {isYou ? '你' : 'AI'}
                                                </div>
                                                <div className={`chat-bubble ${isYou ? 'user-bubble' : 'ai-bubble'}`}>
                                                    {truncateText(msg.content || '')}
                                                </div>
                                            </div>
                                        );
                                    }) : <div className="panel-item is-empty"><div className="panel-badge">AI</div><p>目前沒有對話紀錄。</p></div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <div className="form-actions">
                    {/*<button onClick={handleSummarizeNow} className="btn primary" disabled={loading.action}>{loading.action ? '摘要產生中...' : '立即產生摘要'}</button>*/}
                    <button onClick={handleDownload} className="btn ghost" disabled={loading.download}>{loading.download ? '下載準備中...' : '下載所有摘要'}</button>
                </div>
            </section>

            {selectedMessage && (
                <div
                    className="modal-overlay"
                    onClick={() => setSelectedMessage(null)}
                    role="presentation"
                >
                    <div
                        className="modal-content"
                        onClick={e => e.stopPropagation()}
                        role="dialog"//role屬性是為這個元素賦予明確的語義和功能角色
                        aria-modal="true"
                    >
                        <button type="button" className="modal-close" aria-label="關閉視窗" onClick={() => setSelectedMessage(null)}>×</button>
                        <div className={`modal-header ${selectedMessage.message_type === 'text' ? 'is-user' : 'is-ai'}`}>
                            <div className="modal-avatar">{selectedMessage.message_type === 'text' ? '你' : 'AI'}</div>
                            <h3 className="modal-title">{selectedMessage.message_type === 'text' ? '你的訊息' : 'AI 回覆'}</h3>
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
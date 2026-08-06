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
import { useTranslation } from 'react-i18next';
type SummarySection = { key: string; label: string; value: string | string[] | null };
type ToastState = { status: 'success' | 'error'; message: string } | null;

function useAutoClose<T>(value: T, setter: (v: null) => void) {
    useEffect(() => {
        if (!value) return;
        const timer = setTimeout(() => setter(null), 3000);
        return () => clearTimeout(timer);
    }, [value, setter]);
}


const getSummaryKey = (s: ConsultationSummary) => s?.summary_date ?? '';


function toSummarySections(summary: ConsultationSummary, t: (key: string) => string): SummarySection[] {
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

    if (!content) return source?.trim() ? [{ key: 'summary', label: t('consultRecord.summaryContent'), value: source.trim() }] : [];

    return Object.entries(content)
        .map(([key, val]) => {
            let finalValue: string | string[];

            if (Array.isArray(val)) {
                finalValue = val as string[];
            } else if (val === null || val === undefined) {
                finalValue = t('consultRecord.none');
            } else if (typeof val === 'object') {
                finalValue = JSON.stringify(val, null, 2);
            } else {
                finalValue = String(val).trim() || t('consultRecord.none');
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
            return textValue.length > 0 && textValue !== t('consultRecord.none'); // 有效文字才留下
        });
}

const ConsultRecordsPage: React.FC = () => {
    const { t, i18n } = useTranslation(); //用於多語系翻譯
    const [summaryItems, setSummaryItems] = useState<ConsultationSummary[]>([]);
    const [selectedSummaryKey, setSelectedSummaryKey] = useState<string>('');
    const [rawMessages, setRawMessages] = useState<ConsultationMessage[]>([]);
    const [viewMode, setViewMode] = useState<'summary' | 'raw'>('summary');
    const [loading, setLoading] = useState({ list: false, action: false, download: false });
    const [summaryError, setSummaryError] = useState<string | null>(null);
    const [toast, setToast] = useState<ToastState>(null);
    const [selectedMessage, setSelectedMessage] = useState<ConsultationMessage | null>(null);

    const selectedSummary = summaryItems.find(item => getSummaryKey(item) === selectedSummaryKey) || summaryItems[0] || null;
    const selectedSummarySections = selectedSummary ? toSummarySections(selectedSummary, t) : [];

    useAutoClose(toast, setToast);
    const truncateText = (text: string) => {
        if (!text)
            return t('consultRecord.noContent');
        if (text.length > 50)
            return `${text.slice(0, 50)}...`;
        return text;
    };
    const formatSummaryDate = (s: ConsultationSummary) =>
        getSummaryKey(s).slice(5, 10).replaceAll('-', '/') || t('consultRecord.unnamedDate');
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
                setSummaryError(summariesResult.reason instanceof Error ? summariesResult.reason.message : t('consultRecord.loadSummaryError'));
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
            setSummaryError(error instanceof Error ? error.message : t('consultRecord.loadSummaryError'));
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
                setToast({ status: 'success', message: t('consultRecord.downloadSuccess') });
            } else {
                globalThis.location.href = downloadUrl;
            }
        } catch (error) {
            setToast({ status: 'error', message: error instanceof Error ? error.message : t('consultRecord.downloadFailed') });
        } finally {
            setLoading(prev => ({ ...prev, download: false }));
        }
    };

    return (
        <div className="consult-page">
            {toast && <div className={`saveToast ${toast.status === 'success' ? 'saveToastSuccess' : 'saveToastError'}`}>{toast.message}</div>}

            <header className="consult-header">
                <h2>{t('consultRecord.title')}</h2>
                <p>{t('consultRecord.description')}</p>
            </header>

            <section className="consult-card">
                <div className="panel">
                    <div className="panel-top">
                        <div className="panel-time">
                            {new Date().toLocaleTimeString(i18n.language || 'zh-TW', {
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </div>
                        <div className="panel-notch"><div className="panel-dot" /><div className="panel-speaker" /><div className="panel-dot" /></div>
                        <div className="panel-status">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="iconOnPhone"><path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" /></svg>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="iconOnPhone"><path fillRule="evenodd" d="M3.75 6.75a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3v-.037c.856-.174 1.5-.93 1.5-1.838v-2.25c0-.907-.644-1.664-1.5-1.837V9.75a3 3 0 0 0-3-3h-15Zm15 1.5a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-15a1.5 1.5 0 0 1-1.5-1.5v-6a1.5 1.5 0 0 1 1.5-1.5h15ZM4.5 9.75a.75.75 0 0 0-.75.75V15c0 .414.336.75.75.75H18a.75.75 0 0 0 .75-.75v-4.5a.75.75 0 0 0-.75-.75H4.5Z" clipRule="evenodd" /></svg>
                        </div>

                    </div>
                    <div className="panel-controls" role="tablist" aria-label={t('consultRecord.title')}>
                        <button type="button" className={`summaryBtn ${viewMode === 'summary' ? 'active' : ''}`} onClick={() => setViewMode('summary')} aria-pressed={viewMode === 'summary'}>{t('consultRecord.tabSummary')}</button>
                        <button type="button" className={`rawMsgBtn ${viewMode === 'raw' ? 'active' : ''}`} onClick={() => setViewMode('raw')} aria-pressed={viewMode === 'raw'}>{t('consultRecord.tabRaw')}</button>
                    </div>
                    <div className="panel-list">
                        {loading.list && <div className="panel-item is-muted"><div className="panel-badge">AI</div><p>{t('consultRecord.loading')}</p></div>}
                        {!loading.list && summaryError && <div className="panel-item is-error"><div className="panel-badge">AI</div><p>{t('consultRecord.loadSummaryError')}</p></div>}
                        {!loading.list && (
                            <>
                                {viewMode === 'summary' && (
                                    summaryItems.length > 0 ? (
                                        <div className="panel-item compact">
                                            <div className="compact-header">
                                                <label className="summary-label" htmlFor="summary-select">{t('consultRecord.summaryDate')}</label>
                                                {/*選擇日期的下拉選單*/}
                                                <select id="summary-select" className="summary-select" value={selectedSummaryKey} onChange={e => setSelectedSummaryKey(e.target.value)}>
                                                    {summaryItems.map(s => <option key={getSummaryKey(s)} value={getSummaryKey(s)}>{formatSummaryDate(s)}</option>)}
                                                </select>
                                            </div>
                                            <div className="summary-viewer compact-body">
                                                <div className="summary-title">{t('consultRecord.summaryTitle')}</div>
                                                {selectedSummarySections.length > 0 ? selectedSummarySections.map(section => (
                                                    <section key={section.key} className="summary-section">
                                                        <div className="summary-section-title">{section.label}</div>
                                                        <div className="summary-section-body markdown-content">
                                                            <ReactMarkdown>{Array.isArray(section.value) ? section.value.map(item => `- ${item}`).join('\n') : section.value ?? t('consultRecord.none')}</ReactMarkdown>
                                                        </div>
                                                    </section>
                                                )) : <div className="summary-empty">{t('consultRecord.emptySummary')}</div>}
                                            </div>
                                        </div>
                                    ) : <div className="panel-item is-empty"><div className="panel-badge">AI</div><p>{t('consultRecord.noSummaryData')}</p></div>
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
                                                    {isYou ? t('consultRecord.userBadge') : t('consultRecord.aiBadge')}
                                                </div>
                                                <div className={`chat-bubble ${isYou ? 'user-bubble' : 'ai-bubble'}`}>
                                                    {truncateText(msg.content || t('consultRecord.noContent'))}
                                                </div>
                                            </div>
                                        );
                                    }) : <div className="panel-item is-empty"><div className="panel-badge">AI</div><p>{t('consultRecord.noRawMessages')}</p></div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <div className="form-actions">
                    {/*<button onClick={handleSummarizeNow} className="btn primary" disabled={loading.action}>{loading.action ? '摘要產生中...' : '立即產生摘要'}</button>*/}
                    <button onClick={handleDownload} className="btn ghost" disabled={loading.download}>{loading.download ? t('consultRecord.downloading') : t('consultRecord.downloadAll')}</button>
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
                            <div className="modal-avatar">{selectedMessage.message_type === 'text' ? t('consultRecord.userBadge') : t('consultRecord.aiBadge')}</div>
                            <h3 className="modal-title">{selectedMessage.message_type === 'text' ? t('consultRecord.modalUserTitle') : t('consultRecord.modalAiTitle')}</h3>
                        </div>
                        <div className="modal-body markdown-content">
                            <ReactMarkdown>{selectedMessage.content || t('consultRecord.noContent')}</ReactMarkdown>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConsultRecordsPage;
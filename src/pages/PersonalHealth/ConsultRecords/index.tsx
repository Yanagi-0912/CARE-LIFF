import React, { useState, useEffect } from 'react';
import liff from '@line/liff';
import ReactMarkdown from 'react-markdown';
import {
    getAllSummaries,
    fetchConsultationMeRaw,
    getConsultationSummaryDownloadToken,
    buildConsultationSummaryDownloadUrl,
} from '../../../api/consultationApi';
import { toast } from 'sonner';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import * as S from './styles';
import type { ConsultationMessage, ConsultationSummary } from '../../../types/consultation';
import { useTranslation } from 'react-i18next';
type SummarySection = { key: string; label: string; value: string | string[] | null };


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
    const [selectedMessage, setSelectedMessage] = useState<ConsultationMessage | null>(null);

    const selectedSummary = summaryItems.find(item => getSummaryKey(item) === selectedSummaryKey) || summaryItems[0] || null;
    const selectedSummarySections = selectedSummary ? toSummarySections(selectedSummary, t) : [];

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
        setLoading(prev => ({ ...prev, download: true }));
        try {
            const tokenResult = await getConsultationSummaryDownloadToken();
            const downloadUrl = buildConsultationSummaryDownloadUrl(tokenResult.downloadToken);
            if (liff.isInClient()) {
                liff.openWindow({ url: downloadUrl, external: true });
                toast.success(t('consultRecord.downloadOpened'));
            } else {
                globalThis.location.href = downloadUrl;
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('consultRecord.downloadFailed'));
        } finally {
            setLoading(prev => ({ ...prev, download: false }));
        }
    };

    return (
        <div className={S.PAGE}>
            <header className={S.HEADER}>
                <h2 className={S.HEADER_H2}>{t('consultRecord.title')}</h2>
                <p className={S.HEADER_P}>{t('consultRecord.description')}</p>
            </header>

            <section className={S.CARD}>
                <div className={S.PANEL}>
                    <div className={S.PANEL_TOP}>
                        <div className={S.PANEL_TIME}>
                            {new Date().toLocaleTimeString(i18n.language || 'zh-TW', {
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </div>
                        <div className={S.PANEL_NOTCH}><div className={S.PANEL_DOT} /><div className={S.PANEL_SPEAKER} /><div className={S.PANEL_DOT} /></div>
                        <div className={S.PANEL_STATUS}>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={S.ICON_PHONE}><path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" /></svg>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={S.ICON_PHONE}><path fillRule="evenodd" d="M3.75 6.75a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3v-.037c.856-.174 1.5-.93 1.5-1.838v-2.25c0-.907-.644-1.664-1.5-1.837V9.75a3 3 0 0 0-3-3h-15Zm15 1.5a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-15a1.5 1.5 0 0 1-1.5-1.5v-6a1.5 1.5 0 0 1 1.5-1.5h15ZM4.5 9.75a.75.75 0 0 0-.75.75V15c0 .414.336.75.75.75H18a.75.75 0 0 0 .75-.75v-4.5a.75.75 0 0 0-.75-.75H4.5Z" clipRule="evenodd" /></svg>
                        </div>

                    </div>
                    <div className={S.PANEL_CONTROLS} role="tablist" aria-label={t('consultRecord.title')}>
                        <button type="button" className={cn(S.TAB, viewMode === 'summary' && S.TAB_ACTIVE)} onClick={() => setViewMode('summary')} aria-pressed={viewMode === 'summary'}>{t('consultRecord.tabSummary')}<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={S.TAB_ICON} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg></button>
                        <button type="button" className={cn(S.TAB, viewMode === 'raw' && S.TAB_ACTIVE)} onClick={() => setViewMode('raw')} aria-pressed={viewMode === 'raw'}>{t('consultRecord.tabRaw')}<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={S.TAB_ICON} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" /></svg></button>
                    </div>
                    <div className={S.PANEL_LIST}>
                        {loading.list && <div className={cn(S.ITEM, S.ITEM_MUTED)}><div className={S.BADGE}>AI</div><p>{t('consultRecord.loading')}</p></div>}
                        {/* summaryError 在設定時就已是「具體訊息 or 通用備援」，此處直接顯示它。
                            原本固定渲染通用文字，等於讓那個 state 形同虛設。 */}
                        {!loading.list && summaryError && <div className={S.ITEM}><div className={cn(S.BADGE, S.BADGE_ERROR)}>AI</div><p>{summaryError}</p></div>}
                        {!loading.list && (
                            <>
                                {viewMode === 'summary' && (
                                    summaryItems.length > 0 ? (
                                        <div className={cn(S.ITEM, S.COMPACT)}>
                                            <div className={S.COMPACT_HEADER}>
                                                <label className={S.SUMMARY_LABEL} htmlFor="summary-select">{t('consultRecord.summaryDate')}</label>
                                                {/*選擇日期的下拉選單*/}
                                                <select id="summary-select" className={S.SUMMARY_SELECT} value={selectedSummaryKey} onChange={e => setSelectedSummaryKey(e.target.value)}>
                                                    {summaryItems.map(s => <option key={getSummaryKey(s)} value={getSummaryKey(s)}>{formatSummaryDate(s)}</option>)}
                                                </select>
                                            </div>
                                            <div className={S.VIEWER}>
                                                <div className={S.SUMMARY_TITLE}>{t('consultRecord.summaryTitle')}</div>
                                                {selectedSummarySections.length > 0 ? selectedSummarySections.map(section => (
                                                    <section key={section.key} className={S.SECTION}>
                                                        <div className={S.SECTION_TITLE}>{section.label}</div>
                                                        <div className={cn(S.SECTION_BODY, S.MARKDOWN)}>
                                                            <ReactMarkdown>{Array.isArray(section.value) ? section.value.map(item => `- ${item}`).join('\n') : section.value ?? t('consultRecord.none')}</ReactMarkdown>
                                                        </div>
                                                    </section>
                                                )) : <div className={S.SUMMARY_EMPTY}>{t('consultRecord.emptySummary')}</div>}
                                            </div>
                                        </div>
                                    ) : <div className={cn(S.ITEM, S.ITEM_EMPTY)}><div className={S.BADGE}>AI</div><p>{t('consultRecord.noSummaryData')}</p></div>
                                )}
                                {viewMode === 'raw' && (
                                    rawMessages.length > 0 ? rawMessages.map((msg, idx) => {
                                        const isYou = msg.message_type === 'text';
                                        return (
                                            <div
                                                key={`raw_${idx}`}
                                                className={cn(S.CHAT_ROW, isYou && S.CHAT_ROW_USER)}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => setSelectedMessage(msg)}
                                                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setSelectedMessage(msg)}
                                            >
                                                <div className={cn(S.BADGE, isYou ? S.USER_BADGE : S.AI_BADGE)}>
                                                    {isYou ? t('consultRecord.userBadge') : t('consultRecord.aiBadge')}
                                                </div>
                                                <div className={isYou ? S.USER_BUBBLE : S.AI_BUBBLE}>
                                                    {truncateText(msg.content || t('consultRecord.noContent'))}
                                                </div>
                                            </div>
                                        );
                                    }) : <div className={cn(S.ITEM, S.ITEM_EMPTY)}><div className={S.BADGE}>AI</div><p>{t('consultRecord.noRawMessages')}</p></div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <div className={S.FORM_ACTIONS}>
                    {/*<button onClick={handleSummarizeNow} className="btn primary" disabled={loading.action}>{loading.action ? '摘要產生中...' : '立即產生摘要'}</button>*/}
                    <button onClick={handleDownload} className={cn(S.BTN, S.BTN_GHOST)} disabled={loading.download}>{loading.download ? t('consultRecord.downloading') : t('consultRecord.downloadAll')}</button>
                </div>
            </section>

            {/* Dialog 取代原本手刻的遮罩＋div[role=dialog]：
                焦點鎖定、Escape 關閉、關閉後焦點歸位、背景鎖捲皆由元件提供。
                showCloseButton={false}：沿用原本的自訂關閉鈕，
                其 aria-label「關閉視窗」是測試的定位點。 */}
            <Dialog open={selectedMessage !== null} onOpenChange={(open) => !open && setSelectedMessage(null)}>
                <DialogContent className={S.MODAL} showCloseButton={false}>
                    {selectedMessage && (
                        <>
                            <DialogClose
                                render={
                                    <button type="button" className={S.MODAL_CLOSE} aria-label="關閉視窗">×</button>
                                }
                            />
                            <div className={S.MODAL_HEADER}>
                                <div className={cn(S.MODAL_AVATAR, selectedMessage.message_type === 'text' ? S.AVATAR_USER : S.AVATAR_AI)}>{selectedMessage.message_type === 'text' ? t('consultRecord.userBadge') : t('consultRecord.aiBadge')}</div>
                                <DialogTitle className={S.MODAL_TITLE}>{selectedMessage.message_type === 'text' ? t('consultRecord.modalUserTitle') : t('consultRecord.modalAiTitle')}</DialogTitle>
                            </div>
                            <div className={cn(S.MARKDOWN, S.MODAL_BODY)}>
                                <ReactMarkdown>{selectedMessage.content || t('consultRecord.noContent')}</ReactMarkdown>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ConsultRecordsPage;
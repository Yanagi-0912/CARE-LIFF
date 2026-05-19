import React, { useState, useEffect } from 'react';
import { fetchConsultationMe, summarizeConsultationMe } from '../../../api/consultationApi';
import './index.css';
import ReactMarkdown from 'react-markdown';

interface ConsultRecord {
    id: string;
    userMessage: string;
    aiReply: string;
    summary: string;
    timestamp: number;
}

interface RawMessage {
    message_type?: string;
    content?: string;
}

const LOCAL_KEY = 'consult_records';
const DAY_MS = 24 * 60 * 60 * 1000;

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
    const [summaryText, setSummaryText] = useState<string | null>(null);
    const [rawMessages, setRawMessages] = useState<RawMessage[]>([]);

    // 控制摘要/原始對話畫面切換
    const [viewMode, setViewMode] = useState<'summary' | 'raw'>('summary');
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summaryActionLoading, setSummaryActionLoading] = useState(false);
    const [summaryError, setSummaryError] = useState<string | null>(null);

    // 截斷過長的文字
    const truncateText = (text: string, maxLength: number = 100): string => {
        if (!text) return '（無內容）';
        return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
    };

    const loadSummary = async () => {
        setSummaryLoading(true);
        setSummaryError(null);
        try {
            const data = await fetchConsultationMe();
            setSummaryText(data.summary?.trim() || null);
            setRawMessages(
                Array.isArray(data.messages)
                    ? data.messages.map((message: RawMessage) => ({
                        message_type: message.message_type,
                        content: message.content,
                    }))
                    : []
            );

            // 根據後端預設的 view_type 來決定初始畫面
            if (data.view_type === 'raw') {
                setViewMode('raw');
            } else {
                setViewMode('summary');
            }
        }
        catch (error) {
            setSummaryText(null);
            setRawMessages([]);
            setSummaryError(error instanceof Error ? error.message : '取得摘要失敗');
        }
        finally {
            setSummaryLoading(false);
        }
    };

    // 載入紀錄，僅保留 7 天內
    useEffect(() => {
        loadSummary();
        const now = Date.now();
        const all = loadRecords();
        const filtered = all.filter(r => now - r.timestamp < 7 * DAY_MS);
        setRecords(filtered);
        if (filtered.length !== all.length) saveRecords(filtered);
    }, []);

    const handleSummarizeNow = async () => {
        setSummaryActionLoading(true);
        setSummaryError(null);
        try {
            const result = await summarizeConsultationMe({ force: true });
            const newSummary = result.summary?.trim() || null;
            setSummaryText(newSummary);

            // 並把畫面切到摘要
            setViewMode('summary');

            // 存入本地歷史紀錄
            if (newSummary) {
                const newRecord: ConsultRecord = {
                    id: Date.now().toString(),
                    userMessage: "本次健康諮詢摘要",
                    aiReply: "已產生摘要",
                    summary: newSummary,
                    timestamp: Date.now()
                };
                const updated = [newRecord, ...records];
                setRecords(updated);
                saveRecords(updated);
            }
        }
        catch (error) {
            setSummaryError(error instanceof Error ? error.message : '產生摘要失敗');
        }
        finally {
            setSummaryActionLoading(false);
        }
    };

    // 下載 json
    const handleDownload = () => {
        const data = JSON.stringify(records, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `consult_records_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    return (
        <div className="consult-page">
            <header className="consult-header">
                <h2>健康諮詢紀錄</h2>
                <p>保存 7 天內的對話，並以 AI 摘要整理重點。</p>
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

                        {(summaryText || rawMessages.length > 0) && (
                            <div className="panel-controls">
                                <button
                                    className={`toggle-btn ${viewMode === 'summary' ? 'active' : ''}`}
                                    onClick={() => setViewMode('summary')}
                                    disabled={!summaryText} // 沒有摘要時禁用
                                >
                                    摘要
                                </button>
                                <button
                                    className={`toggle-btn ${viewMode === 'raw' ? 'active' : ''}`}
                                    onClick={() => setViewMode('raw')}
                                    disabled={rawMessages.length === 0} // 沒有對話時禁用
                                >
                                    對話
                                </button>
                            </div>
                        )}
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

                        {/* 根據 viewMode 來決定秀出哪一個區塊 */}
                        {!summaryLoading && !summaryError && (
                            <>
                                {/* 顯示 AI 摘要 */}
                                {viewMode === 'summary' && (
                                    summaryText ? (
                                        <div className="panel-item">
                                            <div className="panel-badge">AI</div>
                                            <div className="markdown-content">
                                                <ReactMarkdown>{summaryText}</ReactMarkdown>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="panel-item is-muted">
                                            <div className="panel-badge">AI</div>
                                            <p>尚未產生摘要，請點「立即產生摘要」開始。</p>
                                        </div>
                                    )
                                )}

                                {/* 顯示原始對話紀錄 */}
                                {viewMode === 'raw' && (
                                    rawMessages.length > 0 ? (
                                        rawMessages.map((message, index) => {
                                            const isYou = message.message_type === 'text';
                                            return (
                                                <div
                                                    key={`raw_${index}`}
                                                    className={`chat-row ${isYou ? 'user' : 'ai'}`}
                                                >
                                                    <div className={`panel-badge ${isYou ? 'user-badge' : 'ai-badge'}`}>
                                                        {isYou ? '你' : 'AI'}
                                                    </div>
                                                    <div className={`chat-bubble ${isYou ? 'user-bubble' : 'ai-bubble'}`}>
                                                        {/* 避免文字太長，只保留前 50 個字 */}
                                                        {truncateText(message.content || '', 50)}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="panel-item is-muted">
                                            <div className="panel-badge">AI</div>
                                            <p>暫無對話紀錄。</p>
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
                    <button onClick={handleDownload} className="btn ghost">下載所有紀錄（JSON）</button>
                </div>
            </section>
        </div>
    );
};

export default ConsultRecordsPage;
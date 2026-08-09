import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import liff from '@line/liff';
import ReactMarkdown from 'react-markdown';
import {
    getAllSummaries,
    fetchConsultationMeRaw,
    getConsultationSummaryDownloadToken,
    buildConsultationSummaryDownloadUrl,
} from '../../../api/consultationApi';
import { toast } from 'sonner';
import { FileTextIcon, MessageCircleIcon, XIcon } from 'lucide-react';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { queryKeys } from '@/lib/queryClient';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * ReactMarkdown 產出的 HTML 掛不到 class，只能用後代選擇器統一排版。
 * 這是唯一留下來的 class 常數 —— 純粹是 markdown 的字級／間距，不是設計樣式。
 */
const MARKDOWN =
    '[&_p]:mb-2 [&_p:last-child]:mb-0 [&_p]:leading-relaxed [&_strong]:font-semibold [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1';
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
    const { t } = useTranslation(); //用於多語系翻譯
    const [selectedSummaryKey, setSelectedSummaryKey] = useState<string>('');
    const [viewMode, setViewMode] = useState<'summary' | 'raw'>('summary');
    const [downloading, setDownloading] = useState(false);
    const [selectedMessage, setSelectedMessage] = useState<ConsultationMessage | null>(null);

    // 兩筆資料各自獨立查詢（原本用 Promise.allSettled 併發並手動拆解結果）。
    // 分開之後任一邊失敗不影響另一邊，重試也各自獨立。
    const summariesQuery = useQuery({
        queryKey: queryKeys.consultationSummaries,
        queryFn: getAllSummaries,
    });
    const rawQuery = useQuery({
        queryKey: queryKeys.consultationRaw,
        queryFn: fetchConsultationMeRaw,
    });

    const summaryItems = summariesQuery.data ?? [];
    const rawMessages = rawQuery.data?.messages ?? [];
    const listLoading = summariesQuery.isPending || rawQuery.isPending;
    const summaryError = summariesQuery.error
        ? summariesQuery.error instanceof Error
            ? summariesQuery.error.message
            : t('consultRecord.loadSummaryError')
        : null;

    // 選取的日期改為衍生值：使用者沒選過、或選過的那筆已不在清單裡，就用第一筆。
    // 原本靠 setSelectedSummaryKey 在載入完成後同步，多一份要維護的狀態。
    const effectiveSummaryKey =
        summaryItems.some(item => getSummaryKey(item) === selectedSummaryKey)
            ? selectedSummaryKey
            : getSummaryKey(summaryItems[0] ?? ({} as ConsultationSummary));

    // 預設分頁：有摘要就看摘要；摘要載入失敗但有對話紀錄則自動切到對話。
    useEffect(() => {
        if (summaryItems.length > 0) {
            setViewMode('summary');
        } else if (summariesQuery.isError && rawMessages.length > 0) {
            setViewMode('raw');
        }
    }, [summaryItems.length, summariesQuery.isError, rawMessages.length]);

    const selectedSummary = summaryItems.find(item => getSummaryKey(item) === effectiveSummaryKey) || null;
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

    const handleDownload = async () => {
        setDownloading(true);
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
            setDownloading(false);
        }
    };

    return (
        <div className="mx-auto flex w-full max-w-[800px] flex-col px-4 py-8 max-[600px]:px-3 max-[600px]:py-6">
            <header className="mb-4">
                <h2 className="text-2xl font-extrabold">{t('consultRecord.title')}</h2>
                <p className="mt-1 text-muted-foreground">{t('consultRecord.description')}</p>
            </header>

            {/* 原本這裡是一台畫出來的「手機」（深色機身、瀏海、喇叭條，
                內容全部寫死 hex 色碼、不吃深色模式）。改成一般的 Card +
                Tabs，內容一樣但配色走 token，也跟其他頁一致。 */}
            <Tabs
                value={viewMode}
                onValueChange={(value) => setViewMode(value as 'summary' | 'raw')}
            >
                <TabsList className="w-full" aria-label={t('consultRecord.title')}>
                    <TabsTrigger value="summary">
                        <FileTextIcon data-icon="inline-start" />
                        {t('consultRecord.tabSummary')}
                    </TabsTrigger>
                    <TabsTrigger value="raw">
                        <MessageCircleIcon data-icon="inline-start" />
                        {t('consultRecord.tabRaw')}
                    </TabsTrigger>
                </TabsList>

                <Card>
                    <CardContent className="flex flex-col gap-3">
                        {listLoading && (
                            <div className="flex flex-col gap-2" aria-busy="true" aria-label={t('consultRecord.loading')}>
                                <Skeleton className="h-6 w-40" />
                                <Skeleton className="h-20 w-full" />
                                <Skeleton className="h-20 w-full" />
                            </div>
                        )}

                        {/* summaryError 在設定時就已是「具體訊息 or 通用備援」，此處直接顯示它。
                            原本固定渲染通用文字，等於讓那個 state 形同虛設。 */}
                        {!listLoading && summaryError && (
                            <Alert variant="destructive">
                                <AlertDescription>{summaryError}</AlertDescription>
                            </Alert>
                        )}

                        {!listLoading && (
                            <>
                                <TabsContent value="summary" className="flex flex-col gap-3">
                                    {summaryItems.length > 0 ? (
                                        <>
                                            <Field orientation="horizontal" className="items-center">
                                                <FieldLabel htmlFor="summary-select">
                                                    {t('consultRecord.summaryDate')}
                                                </FieldLabel>
                                                {/*選擇日期的下拉選單*/}
                                                <Select
                                                    value={effectiveSummaryKey}
                                                    onValueChange={(value) => setSelectedSummaryKey(value ?? '')}
                                                >
                                                    <SelectTrigger id="summary-select" className="ml-auto min-w-32">
                                                        {/* 值是完整日期字串，顯示要用 formatSummaryDate 縮成 MM/DD */}
                                                        <SelectValue>
                                                            {(value) => {
                                                                const item = summaryItems.find(s => getSummaryKey(s) === value);
                                                                return item ? formatSummaryDate(item) : String(value ?? '');
                                                            }}
                                                        </SelectValue>
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {summaryItems.map(s => (
                                                            <SelectItem key={getSummaryKey(s)} value={getSummaryKey(s)}>
                                                                {formatSummaryDate(s)}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </Field>

                                            <h3 className="text-lg font-extrabold">
                                                {t('consultRecord.summaryTitle')}
                                            </h3>

                                            {selectedSummarySections.length > 0 ? (
                                                selectedSummarySections.map(section => (
                                                    <Card key={section.key} size="sm">
                                                        <CardContent className="flex flex-col gap-2">
                                                            <Badge variant="secondary" className="w-fit">
                                                                {section.label}
                                                            </Badge>
                                                            <div className={cn('text-base', MARKDOWN)}>
                                                                <ReactMarkdown>
                                                                    {Array.isArray(section.value)
                                                                        ? section.value.map(item => `- ${item}`).join('\n')
                                                                        : section.value ?? t('consultRecord.none')}
                                                                </ReactMarkdown>
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                ))
                                            ) : (
                                                <Empty className="border border-dashed">
                                                    <EmptyHeader>
                                                        <EmptyTitle>{t('consultRecord.emptySummary')}</EmptyTitle>
                                                    </EmptyHeader>
                                                </Empty>
                                            )}
                                        </>
                                    ) : (
                                        <Empty className="border border-dashed">
                                            <EmptyHeader>
                                                <EmptyTitle>{t('consultRecord.noSummaryData')}</EmptyTitle>
                                                <EmptyDescription>{t('consultRecord.description')}</EmptyDescription>
                                            </EmptyHeader>
                                        </Empty>
                                    )}
                                </TabsContent>

                                <TabsContent value="raw" className="flex flex-col gap-3">
                                    {rawMessages.length > 0 ? (
                                        rawMessages.map((msg, idx) => {
                                            const isYou = msg.message_type === 'text';
                                            return (
                                                <button
                                                    key={`raw_${idx}`}
                                                    type="button"
                                                    className={cn(
                                                        'flex cursor-pointer items-start gap-2.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                                                        isYou && 'flex-row-reverse',
                                                    )}
                                                    onClick={() => setSelectedMessage(msg)}
                                                >
                                                    <Avatar className="size-8">
                                                        <AvatarFallback
                                                            className={cn(
                                                                'text-xs font-bold',
                                                                isYou
                                                                    ? 'bg-primary text-primary-foreground'
                                                                    : 'bg-secondary text-secondary-foreground',
                                                            )}
                                                        >
                                                            {isYou ? t('consultRecord.userBadge') : t('consultRecord.aiBadge')}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div
                                                        className={cn(
                                                            'max-w-[75%] rounded-2xl px-3.5 py-2.5 leading-relaxed',
                                                            isYou
                                                                ? 'rounded-tr-sm bg-primary/10 text-foreground'
                                                                : 'rounded-tl-sm bg-muted text-foreground',
                                                        )}
                                                    >
                                                        {truncateText(msg.content || t('consultRecord.noContent'))}
                                                    </div>
                                                </button>
                                            );
                                        })
                                    ) : (
                                        <Empty className="border border-dashed">
                                            <EmptyHeader>
                                                <EmptyTitle>{t('consultRecord.noRawMessages')}</EmptyTitle>
                                            </EmptyHeader>
                                        </Empty>
                                    )}
                                </TabsContent>
                            </>
                        )}
                    </CardContent>
                </Card>
            </Tabs>

            <div className="mt-4 flex flex-wrap gap-2.5">
                <Button
                    type="button"
                    variant="outline"
                    onClick={handleDownload}
                    disabled={downloading}
                >
                    {downloading ? t('consultRecord.downloading') : t('consultRecord.downloadAll')}
                </Button>
            </div>

            {/* Dialog 取代原本手刻的遮罩＋div[role=dialog]：
                焦點鎖定、Escape 關閉、關閉後焦點歸位、背景鎖捲皆由元件提供。
                關閉鈕自己掛：內建那顆的 sr-only 文字寫死英文 "Close"。 */}
            <Dialog open={selectedMessage !== null} onOpenChange={(open) => !open && setSelectedMessage(null)}>
                <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-[480px]" showCloseButton={false}>
                    {selectedMessage && (
                        <>
                            <DialogClose
                                render={
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        className="absolute top-4 right-4"
                                        aria-label={t('consultRecord.closeModal')}
                                    />
                                }
                            >
                                <XIcon />
                            </DialogClose>

                            <DialogHeader>
                                <div className="flex items-center gap-3">
                                    <Avatar className="size-11">
                                        <AvatarFallback
                                            className={cn(
                                                'font-bold',
                                                selectedMessage.message_type === 'text'
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'bg-secondary text-secondary-foreground',
                                            )}
                                        >
                                            {selectedMessage.message_type === 'text'
                                                ? t('consultRecord.userBadge')
                                                : t('consultRecord.aiBadge')}
                                        </AvatarFallback>
                                    </Avatar>
                                    <DialogTitle className="text-xl font-bold">
                                        {selectedMessage.message_type === 'text'
                                            ? t('consultRecord.modalUserTitle')
                                            : t('consultRecord.modalAiTitle')}
                                    </DialogTitle>
                                </div>
                            </DialogHeader>

                            <div className={cn('leading-relaxed [overflow-wrap:anywhere]', MARKDOWN)}>
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
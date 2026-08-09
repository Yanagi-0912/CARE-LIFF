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
import { ChevronRightIcon, DownloadIcon, FileTextIcon, MessageCircleIcon, XIcon } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import {
    Item,
    ItemContent,
    ItemDescription,
    ItemGroup,
    ItemHeader,
    ItemMedia,
    ItemTitle,
} from '@/components/ui/item';
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

/** 使用者送出的訊息是 text，其餘（ai_response…）一律視為 AI 回覆 */
const isUserMessage = (msg: ConsultationMessage) => msg.message_type === 'text';


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

/** 卡片列的骨架屏，與實際的 Item 同一組元件，外框自然對齊 */
function RecordSkeleton({ rows, label }: { rows: number; label: string }) {
    return (
        <ItemGroup className="gap-3" aria-busy="true" aria-label={label}>
            {Array.from({ length: rows }, (_, i) => (
                <Item key={i} variant="outline">
                    <ItemMedia>
                        <Skeleton className="size-9 rounded-full" />
                    </ItemMedia>
                    <ItemContent>
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-full" />
                    </ItemContent>
                </Item>
            ))}
        </ItemGroup>
    );
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

    // summary_date 可能是純日期，也可能是 ISO 時間字串（2026-07-02T00:00:00Z），
    // 取第 5~10 個字元就是兩者共通的 MM-DD 段落，不必解析日期
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
        // 手機優先：內容直接鋪在頁面上，不再包一層 Card。原本「Card 包 Tabs 再包
        // Card」在 320px 寬會被兩層外框與內距吃掉近 60px，正文只剩十來個字。
        <div className="mx-auto flex w-full max-w-[800px] flex-col gap-4 p-4">
            <header>
                <h2 className="text-2xl font-extrabold">{t('consultRecord.title')}</h2>
                <p className="mt-1 text-muted-foreground">{t('consultRecord.description')}</p>
            </header>

            <Tabs
                className="gap-4"
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

                {/* 兩個查詢各自獨立，載入與錯誤狀態也分別掛在自己的分頁裡 */}
                <TabsContent value="summary" className="flex flex-col gap-4">
                    {summariesQuery.isPending ? (
                        <RecordSkeleton rows={3} label={t('consultRecord.loading')} />
                    ) : summaryError ? (
                        <Alert variant="destructive">
                            <AlertDescription>{summaryError}</AlertDescription>
                        </Alert>
                    ) : summaryItems.length > 0 ? (
                        <>
                            {/* 直向 Field：標籤在上、選單滿版。原本是橫向一列，
                                在窄螢幕上標籤被壓成一字一行、選單還被推出卡片外 */}
                            <Field>
                                <FieldLabel htmlFor="summary-select">
                                    {t('consultRecord.summaryDate')}
                                </FieldLabel>
                                <Select
                                    value={effectiveSummaryKey}
                                    onValueChange={(value) => setSelectedSummaryKey(value ?? '')}
                                >
                                    {/* 手機滿版好按，桌機收窄避免一個日期橫跨整頁 */}
                                    <SelectTrigger id="summary-select" className="w-full sm:w-56">
                                        {/* 值是完整日期字串，顯示要用 formatSummaryDate 轉成 YYYY/MM/DD */}
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

                            {selectedSummarySections.length > 0 ? (
                                <ItemGroup className="gap-3" aria-label={t('consultRecord.summaryTitle')}>
                                    {selectedSummarySections.map(section => (
                                        // ItemHeader 是 basis-full，會自成一列，
                                        // 標題在上、內容在下，不必自己排 flex-col
                                        <Item key={section.key} variant="outline">
                                            <ItemHeader>
                                                <ItemTitle className="text-base font-bold">
                                                    {section.label}
                                                </ItemTitle>
                                            </ItemHeader>
                                            <ItemContent className={cn('text-base', MARKDOWN)}>
                                                <ReactMarkdown>
                                                    {Array.isArray(section.value)
                                                        ? section.value.map(item => `- ${item}`).join('\n')
                                                        : section.value ?? t('consultRecord.none')}
                                                </ReactMarkdown>
                                            </ItemContent>
                                        </Item>
                                    ))}
                                </ItemGroup>
                            ) : (
                                <Empty className="border border-dashed">
                                    <EmptyHeader>
                                        <EmptyMedia variant="icon">
                                            <FileTextIcon />
                                        </EmptyMedia>
                                        <EmptyTitle>{t('consultRecord.emptySummary')}</EmptyTitle>
                                    </EmptyHeader>
                                </Empty>
                            )}
                        </>
                    ) : (
                        <Empty className="border border-dashed">
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <FileTextIcon />
                                </EmptyMedia>
                                <EmptyTitle>{t('consultRecord.noSummaryData')}</EmptyTitle>
                                <EmptyDescription>{t('consultRecord.description')}</EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    )}
                </TabsContent>

                <TabsContent value="raw" className="flex flex-col gap-4">
                    {rawQuery.isPending ? (
                        <RecordSkeleton rows={4} label={t('consultRecord.loading')} />
                    ) : rawMessages.length > 0 ? (
                        // 原本是左右分邊的對話氣泡（max-w-[75%]），在 320px 上一句話
                        // 要斷成四五行。紀錄用的清單改成一列一則，整列可點開全文。
                        <ItemGroup className="gap-2" aria-label={t('consultRecord.tabRaw')}>
                            {rawMessages.map((msg, idx) => {
                                const isYou = isUserMessage(msg);
                                return (
                                    <Item
                                        key={`raw_${idx}`}
                                        variant="outline"
                                        className="cursor-pointer text-left hover:bg-muted/40"
                                        render={
                                            <button type="button" onClick={() => setSelectedMessage(msg)} />
                                        }
                                    >
                                        <ItemMedia>
                                            <Avatar className="size-9">
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
                                        </ItemMedia>
                                        <ItemContent>
                                            <ItemTitle>
                                                {isYou
                                                    ? t('consultRecord.modalUserTitle')
                                                    : t('consultRecord.modalAiTitle')}
                                            </ItemTitle>
                                            <ItemDescription>
                                                {truncateText(msg.content || t('consultRecord.noContent'))}
                                            </ItemDescription>
                                        </ItemContent>
                                        <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
                                    </Item>
                                );
                            })}
                        </ItemGroup>
                    ) : (
                        <Empty className="border border-dashed">
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <MessageCircleIcon />
                                </EmptyMedia>
                                <EmptyTitle>{t('consultRecord.noRawMessages')}</EmptyTitle>
                            </EmptyHeader>
                        </Empty>
                    )}
                </TabsContent>
            </Tabs>

            {/* 手機滿版、桌機收成內容寬度 */}
            <Button
                type="button"
                variant="outline"
                className="w-full sm:w-fit"
                onClick={handleDownload}
                disabled={downloading}
            >
                <DownloadIcon data-icon="inline-start" />
                {downloading ? t('consultRecord.downloading') : t('consultRecord.downloadAll')}
            </Button>

            {/* Dialog 取代原本手刻的遮罩＋div[role=dialog]：
                焦點鎖定、Escape 關閉、關閉後焦點歸位、背景鎖捲皆由元件提供。
                關閉鈕自己掛：內建那顆的 sr-only 文字寫死英文 "Close"。 */}
            <Dialog open={selectedMessage !== null} onOpenChange={(open) => !open && setSelectedMessage(null)}>
                <DialogContent
                    // 只讓內文捲動，否則 absolute 定位的關閉鈕會跟著捲走
                    className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-[480px]"
                    showCloseButton={false}
                >
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

                            <DialogHeader className="flex-row items-center gap-3 pr-10">
                                <Avatar className="size-11">
                                    <AvatarFallback
                                        className={cn(
                                            'font-bold',
                                            isUserMessage(selectedMessage)
                                                ? 'bg-primary text-primary-foreground'
                                                : 'bg-secondary text-secondary-foreground',
                                        )}
                                    >
                                        {isUserMessage(selectedMessage)
                                            ? t('consultRecord.userBadge')
                                            : t('consultRecord.aiBadge')}
                                    </AvatarFallback>
                                </Avatar>
                                <DialogTitle className="text-xl font-bold">
                                    {isUserMessage(selectedMessage)
                                        ? t('consultRecord.modalUserTitle')
                                        : t('consultRecord.modalAiTitle')}
                                </DialogTitle>
                            </DialogHeader>

                            <div className={cn('overflow-y-auto text-base leading-relaxed [overflow-wrap:anywhere]', MARKDOWN)}>
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

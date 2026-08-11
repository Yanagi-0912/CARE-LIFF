import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CheckIcon, ChevronRightIcon, TriangleAlertIcon, XIcon } from 'lucide-react';

import DecryptedText from '../../components/DecryptedText/DecryptedText';
import { ReportFormDialog } from './ReportFormDialog';
import {
  fetchKnowledgeReports,
  type KnowledgeReportDto,
  type KnowledgeReportReason,
  type KnowledgeReportStatus,
} from '../../api/knowledgeReportsApi';
import { queryKeys } from '@/lib/queryClient';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ItemGroup } from '@/components/ui/item';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DetailItem,
  DetailList,
  KnowledgeHero,
  KnowledgePage,
  ReportRow,
  ReportTag,
  ReportsEmpty,
  ReportsLoading,
  StatsRow,
  StatusBadge,
} from './components';

type ReportFilter = 'all' | KnowledgeReportStatus;
type ReportSort = 'newest' | 'oldest';

interface KnowledgeReport {
  id: string;
  question: string;
  reason: string;
  status: KnowledgeReportStatus;
  submittedAt: string;
  /** 排序用的原始時間戳；顯示用的是上面已格式化的 submittedAt */
  submittedTs: number;
  reviewerNote: string;
  resolution?: string;
  /** 使用者自己填的來源網址與說明；自動建立的回報通常為空 */
  sourceUrls: string[];
  userNote?: string;
}

const REASON_KEYS: Record<KnowledgeReportReason, string> = {
  outdated: 'knowledgeReports.reason.outdated',
  missing: 'knowledgeReports.reason.missing',
  other: 'knowledgeReports.reason.other',
};

function formatSubmittedAt(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function mapReasonLabel(reason: string, t: (key: string) => string): string {
  if (reason in REASON_KEYS) {
    return t(REASON_KEYS[reason as KnowledgeReportReason]);
  }
  return t(REASON_KEYS.other);
}

function mapReportDto(report: KnowledgeReportDto, t: (key: string) => string): KnowledgeReport {
  const ts = Date.parse(report.created_at);
  return {
    id: report.report_id,
    question: report.question,
    reason: mapReasonLabel(report.reason, t),
    status: report.status,
    submittedAt: formatSubmittedAt(report.created_at),
    submittedTs: Number.isNaN(ts) ? 0 : ts,
    reviewerNote: report.reviewer_note?.trim() || t('knowledgeReports.noReviewerNote'),
    resolution: report.resolution?.trim() || undefined,
    sourceUrls: report.user_source_urls ?? [],
    userNote: report.user_note?.trim() || undefined,
  };
}

function KnowledgeReportsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeFilter, setActiveFilter] = useState<ReportFilter>('all');
  const [sort, setSort] = useState<ReportSort>('newest');
  const [selectedReport, setSelectedReport] = useState<KnowledgeReport | null>(null);
  // /knowledge-reports/new 渲染的是同一個頁面元件，只是掛載時自動開表單。
  // 這樣 Rich Menu 或 LINE 訊息能直接把使用者送進表單，又不必複製一份頁面。
  const [formOpen, setFormOpen] = useState(location.pathname.endsWith('/new'));

  const handleFormOpenChange = (open: boolean) => {
    setFormOpen(open);
    if (!open && location.pathname.endsWith('/new')) {
      navigate('/knowledge-reports', { replace: true });
    }
  };
  const {
    data: rawReports = [],
    isPending: loading,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.knowledgeReports,
    queryFn: async () => (await fetchKnowledgeReports()).reports,
  });
  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : t('knowledgeReports.loadError')
    : null;

  const reports = useMemo(
    () => rawReports.map((report) => mapReportDto(report, t)),
    [rawReports, t],
  );

  const statusLabel: Record<KnowledgeReportStatus, string> = {
    pending: t('knowledgeReports.status.pending'),
    reviewing: t('knowledgeReports.status.reviewing'),
    resolved: t('knowledgeReports.status.resolved'),
    rejected: t('knowledgeReports.status.rejected'),
  };

  const filters: Array<{ value: ReportFilter; label: string }> = [
    { value: 'all', label: t('knowledgeReports.filter.all') },
    { value: 'pending', label: t('knowledgeReports.filter.pending') },
    { value: 'reviewing', label: t('knowledgeReports.filter.reviewing') },
    { value: 'resolved', label: t('knowledgeReports.filter.resolved') },
  ];

  const counts = {
    all: reports.length,
    pending: reports.filter((report) => report.status === 'pending').length,
    reviewing: reports.filter((report) => report.status === 'reviewing').length,
    resolved: reports.filter((report) => report.status === 'resolved').length,
    rejected: reports.filter((report) => report.status === 'rejected').length,
  };

  // 排序在篩選之後、渲染之前做一次。舊版的排序下拉只是個擺設（defaultValue
  // 沒有接上任何狀態），選了也不會有反應。
  const visibleReports = useMemo(() => {
    const filtered =
      activeFilter === 'all'
        ? reports
        : reports.filter((report) => report.status === activeFilter);
    return [...filtered].sort((a, b) =>
      sort === 'newest' ? b.submittedTs - a.submittedTs : a.submittedTs - b.submittedTs,
    );
  }, [reports, activeFilter, sort]);

  const latestReport = useMemo(
    () => reports.reduce<KnowledgeReport | null>(
      (latest, report) => (latest === null || report.submittedTs > latest.submittedTs ? report : latest),
      null,
    ),
    [reports],
  );

  const handleAskInLine = () => {
    if (liff.isInClient()) {
      liff.closeWindow();
      return;
    }

    // 舊版用 window.alert：在 LINE webview 外會跳出瀏覽器原生彈窗、阻斷操作，
    // 且無法本地化樣式。改用 App 已有的 sonner toast。
    toast.info(t('knowledgeReports.lineFallback'));
  };

  return (
    <KnowledgePage>
      {/* Alert 是 [icon | 內容] 的兩欄 grid。行動鈕必須放進 AlertDescription 裡，
          直接當 Alert 的第三個子元素會被塞進圖示那一欄並被拉成整列寬。 */}
      <Alert>
        <TriangleAlertIcon />
        <AlertTitle>{t('knowledgeReports.noticeLabel')}</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2 text-foreground">
          {/* basis 16rem 而非 flex-1：低於這個寬度就讓按鈕換行，
              不會把說明文字擠成每行三四個字 */}
          <span className="flex-[1_1_16rem]">{t('knowledgeReports.notice')}</span>
          <Button type="button" variant="outline" size="sm" onClick={handleAskInLine}>
            {t('knowledgeReports.backToLine')}
            <ChevronRightIcon data-icon="inline-end" />
          </Button>
        </AlertDescription>
      </Alert>

      {/* items-stretch（grid 預設）讓兩張卡等高；元件本身不帶 mb-*，
          間距一律由這層的 gap 控制。 */}
      <div className="grid gap-4 min-[900px]:grid-cols-2">
        <KnowledgeHero
          avatar={t('knowledgeReports.avatar')}
          eyebrow={t('knowledgeReports.eyebrow')}
          title={
            <DecryptedText
              text={t('knowledgeReports.title')}
              speed={34}
              sequential
              revealDirection="center"
              useOriginalCharsOnly
              animateOn="view"
            />
          }
          stats={
            <StatsRow
              label={t('knowledgeReports.statsLabel')}
              items={[
                { value: counts.all, label: t('knowledgeReports.stats.total') },
                { value: counts.reviewing, label: t('knowledgeReports.stats.reviewing') },
                { value: counts.resolved, label: t('knowledgeReports.stats.updated') },
              ]}
            />
          }
          action={
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => handleFormOpenChange(true)}>
                {t('knowledgeReports.form.open')}
              </Button>
              <Button type="button" variant="outline" onClick={handleAskInLine}>
                {t('knowledgeReports.askInLine')}
              </Button>
            </div>
          }
        />

        <ReportFormDialog open={formOpen} onOpenChange={handleFormOpenChange} />

        {latestReport && (
          <Card className="h-full" aria-label={t('knowledgeReports.latest')}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <Badge variant="secondary">{t('knowledgeReports.latest')}</Badge>
              <StatusBadge
                status={latestReport.status}
                label={statusLabel[latestReport.status]}
                className="shrink-0"
              />
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-center gap-2">
              <h2 className="text-2xl leading-snug font-extrabold text-balance">
                {latestReport.question}
              </h2>
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {latestReport.reviewerNote}
              </p>
              <time className="text-sm font-semibold text-muted-foreground">
                {t('knowledgeReports.submittedAtValue', { date: latestReport.submittedAt })}
              </time>
            </CardContent>
          </Card>
        )}
      </div>

      <section aria-labelledby="knowledge-list-title" className="flex flex-col gap-3">
        <h2 id="knowledge-list-title" className="sr-only">
          {t('knowledgeReports.listTitle')}
        </h2>

        {/* 篩選是互斥單選 → Tabs。舊版用 ToggleGroup 硬撐一排按鈕，
            窄螢幕時最後一個分類會被切掉在畫面外（沒有可見的捲動提示）。
            TabsList 這裡吃滿寬、四個分類平分，390px 也放得下。 */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* 窄螢幕讓分類獨佔一行，排序才不會擠在旁邊把最後一個分類蓋掉 */}
          <Tabs
            className="w-full min-w-0 min-[640px]:w-auto min-[640px]:flex-1"
            value={activeFilter}
            onValueChange={(value) => setActiveFilter(value as ReportFilter)}
          >
            {/* 分類一律用自然寬度（flex-none）：這個 App 有六種語言，
                讓它們平分寬度的話較長的語系會被截成「待審…」。
                放不下時整條橫向捲動，而不是把字切掉。 */}
            <TabsList
              className="w-full justify-start overflow-x-auto min-[640px]:w-fit [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label={t('knowledgeReports.filterLabel')}
            >
              {filters.map((filter) => (
                <TabsTrigger key={filter.value} value={filter.value} className="flex-none px-2.5">
                  {filter.label}
                  <Badge variant="secondary" className="px-1.5 tabular-nums">
                    {counts[filter.value]}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <Select value={sort} onValueChange={(value) => setSort(value as ReportSort)}>
            <SelectTrigger className="ml-auto shrink-0" aria-label={t('knowledgeReports.sortLabel')}>
              {/* 需對應回翻譯標籤，否則會顯示 newest／oldest 原始值 */}
              <SelectValue>
                {(value) =>
                  value === 'oldest'
                    ? t('knowledgeReports.sort.oldest')
                    : t('knowledgeReports.sort.newest')
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">{t('knowledgeReports.sort.newest')}</SelectItem>
              <SelectItem value="oldest">{t('knowledgeReports.sort.oldest')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <ReportsLoading label={t('knowledgeReports.loading')} />
        ) : error ? (
          <ReportsEmpty
            icon={<TriangleAlertIcon />}
            title={t('knowledgeReports.loadError')}
            description={error}
          />
        ) : reports.length === 0 ? (
          <ReportsEmpty
            icon={<CheckIcon />}
            title={t('knowledgeReports.emptyAllTitle')}
            description={t('knowledgeReports.emptyAllDesc')}
          />
        ) : visibleReports.length === 0 ? (
          <ReportsEmpty
            icon={<CheckIcon />}
            title={t('knowledgeReports.emptyTitle')}
            description={t('knowledgeReports.emptyDesc')}
          />
        ) : (
          <ItemGroup className="gap-3">
            {visibleReports.map((report, index) => (
              <ReportRow
                key={report.id}
                index={index}
                status={report.status}
                statusLabel={statusLabel[report.status]}
                question={report.question}
                ariaLabel={t('knowledgeReports.viewReport', { question: report.question })}
                tags={<ReportTag status={report.status}>{report.reason}</ReportTag>}
                submittedAt={t('knowledgeReports.submittedAtValue', {
                  date: report.submittedAt,
                })}
                reviewLabel={t('knowledgeReports.reviewUpdate')}
                reviewText={report.reviewerNote}
                onClick={() => setSelectedReport(report)}
              />
            ))}
          </ItemGroup>
        )}
      </section>

      {/* Dialog 取代手刻遮罩：焦點鎖定、Escape、焦點歸位、背景鎖捲皆內建 */}
      <Dialog
        open={selectedReport !== null}
        onOpenChange={(open) => !open && setSelectedReport(null)}
      >
        <DialogContent
          className="max-h-[calc(100dvh-48px)] overflow-y-auto sm:max-w-[560px]"
          showCloseButton={false}
        >
          {selectedReport && (
            <>
              {/* 內建的關閉鈕 sr-only 文字寫死英文 "Close"，
                  這個 App 有六種語言，所以自己掛一顆帶 i18n aria-label 的 */}
              <DialogClose
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute top-4 right-4"
                    aria-label={t('knowledgeReports.closeDetail')}
                  />
                }
              >
                <XIcon />
              </DialogClose>

              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2 pr-8">
                  <StatusBadge
                    status={selectedReport.status}
                    label={statusLabel[selectedReport.status]}
                  />
                  <span className="text-xs font-bold text-muted-foreground">
                    {selectedReport.id}
                  </span>
                </div>
                <DialogTitle className="text-2xl leading-snug text-balance">
                  {selectedReport.question}
                </DialogTitle>
              </DialogHeader>

              <DetailList>
                <DetailItem term={t('knowledgeReports.detail.type')}>
                  {selectedReport.reason}
                </DetailItem>
                <DetailItem term={t('knowledgeReports.detail.submittedAt')}>
                  {selectedReport.submittedAt}
                </DetailItem>
                {selectedReport.sourceUrls.length > 0 && (
                  <DetailItem term={t('knowledgeReports.detail.sourceUrls')}>
                    <ul className="flex flex-col gap-1">
                      {selectedReport.sourceUrls.map((sourceUrl) => (
                        <li key={sourceUrl}>
                          <a
                            href={sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-all underline"
                          >
                            {sourceUrl}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </DetailItem>
                )}
                {/* 手動回報的 question 與 user_note 內容相同（design.md 決策 2
                    的已知代價），相同時只顯示一次，避免同一段文字上下相鄰
                    出現兩遍。日後表單若加第三欄，兩者自然分岔。 */}
                {selectedReport.userNote &&
                  selectedReport.userNote !== selectedReport.question && (
                    <DetailItem term={t('knowledgeReports.detail.userNote')}>
                      {selectedReport.userNote}
                    </DetailItem>
                  )}
                <DetailItem term={t('knowledgeReports.detail.progress')}>
                  {selectedReport.reviewerNote}
                </DetailItem>
                {selectedReport.resolution && (
                  <DetailItem term={t('knowledgeReports.detail.result')}>
                    {selectedReport.resolution}
                  </DetailItem>
                )}
              </DetailList>
            </>
          )}
        </DialogContent>
      </Dialog>
    </KnowledgePage>
  );
}

export default KnowledgeReportsPage;

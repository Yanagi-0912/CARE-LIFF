import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import DecryptedText from '../../components/DecryptedText/DecryptedText';
import {
  approveKnowledgeReport,
  fetchAdminKnowledgeReports,
  rejectKnowledgeReport,
  type IngestJobDto,
  type KnowledgeReportDto,
  type KnowledgeReportReason,
  type KnowledgeReportStatus,
} from '../../api/knowledgeReportsApi';
import { queryKeys } from '@/lib/queryClient';
import { CheckIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ItemGroup } from '@/components/ui/item';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
// 與 KnowledgeReports 共用同一組畫面元件（原本是共用同一份 index.css）
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
} from '../KnowledgeReports/components';

type QueueFilter = 'all' | 'pending' | 'reviewing';

/** 每頁筆數；與後端 limit 上限 200 無關，取一個掃得動的量 */
const PAGE_SIZE = 50;

/** ingest 是否仍在跑。status 為 null／undefined 的是舊紀錄，視同已結束 */
function isIngestRunning(job?: IngestJobDto | null): boolean {
  return job?.status === 'running';
}

function isIngestFailed(job?: IngestJobDto | null): boolean {
  return job?.status === 'failed';
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

function AdminKnowledgeReportsPage() {
  const { t } = useTranslation();
  const [activeFilter, setActiveFilter] = useState<QueueFilter>('all');
  const [selectedReport, setSelectedReport] = useState<KnowledgeReportDto | null>(null);
  const [reviewerNote, setReviewerNote] = useState('');
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  // admin 自行補的來源；使用者回報多半沒附 URL，只靠 user_source_urls 這些回報無法核准
  const [extraUrls, setExtraUrls] = useState<string[]>([]);
  const [urlDraft, setUrlDraft] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const {
    data,
    isPending: loading,
    error: queryError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    // 篩選送給後端；client-side 過濾在分頁下只看得到已載入的頁，會讓後面的資料拿不到
    queryKey: queryKeys.adminKnowledgeReports(activeFilter),
    queryFn: ({ pageParam }) =>
      fetchAdminKnowledgeReports({
        limit: PAGE_SIZE,
        offset: pageParam,
        ...(activeFilter === 'all' ? {} : { status: activeFilter }),
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.reports.length, 0);
      return lastPage.total != null && loaded < lastPage.total ? loaded : undefined;
    },
    // ingest 跑在背景，沒有輪詢的話「收錄中」不會自己變成完成／失敗
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) =>
        page.reports.some((report) => isIngestRunning(report.ingest_job)),
      )
        ? 5_000
        : false,
  });

  // offset 分頁在佇列變動時可能重複取到邊界那筆，去重避免重複 key 與重複列
  const reports = useMemo(() => {
    const seen = new Set<string>();
    return (data?.pages.flatMap((page) => page.reports) ?? []).filter((report) => {
      if (seen.has(report.report_id)) return false;
      seen.add(report.report_id);
      return true;
    });
  }, [data]);

  /** 符合當前篩選的總筆數；未載入前退回已載入筆數 */
  const totalCount = data?.pages[0]?.total ?? reports.length;

  // 各狀態筆數一律由後端給，不能拿已載入的頁自己算——那只反映已載入的部分
  const statusCounts = data?.pages[0]?.status_counts;
  const counts: Record<QueueFilter, number | undefined> = {
    pending: statusCounts?.pending,
    reviewing: statusCounts?.reviewing,
    all:
      statusCounts === undefined || statusCounts === null
        ? undefined
        : (statusCounts.pending ?? 0) + (statusCounts.reviewing ?? 0),
  };

  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : t('adminKnowledgeReports.loadError')
    : null;

  // 原本這段抓取邏輯在檔案裡寫了兩份（loadReports 與 effect 內的 run），
  // 內容完全相同；改用 query 後合而為一，審核完成後以 invalidate 重新載入第一頁。
  const reloadReports = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.adminKnowledgeReports(activeFilter) });

  const statusLabel: Record<KnowledgeReportStatus, string> = {
    pending: t('knowledgeReports.status.pending'),
    reviewing: t('knowledgeReports.status.reviewing'),
    resolved: t('knowledgeReports.status.resolved'),
    rejected: t('knowledgeReports.status.rejected'),
  };

  const filters: Array<{ value: QueueFilter; label: string }> = [
    { value: 'all', label: t('adminKnowledgeReports.filter.all') },
    { value: 'pending', label: t('adminKnowledgeReports.filter.pending') },
    { value: 'reviewing', label: t('adminKnowledgeReports.filter.reviewing') },
  ];

  const openDialog = (report: KnowledgeReportDto) => {
    setSelectedReport(report);
    setReviewerNote('');
    setActionError(null);
    setUrlDraft('');
    // 重試時沿用上次實際送出的 URL（含 admin 補的），否則無來源的回報一重開就選不到東西
    const previous = report.ingest_job?.selected_urls;
    if (previous && previous.length > 0) {
      setExtraUrls(previous.filter((url) => !report.user_source_urls.includes(url)));
      setSelectedUrls([...previous]);
      return;
    }
    setExtraUrls([]);
    // 預設全選，維持一鍵核准的手感；要縮小範圍才需要動手取消
    setSelectedUrls([...report.user_source_urls]);
  };

  const closeDialog = () => {
    setSelectedReport(null);
    setReviewerNote('');
    setSelectedUrls([]);
    setExtraUrls([]);
    setUrlDraft('');
    setActionError(null);
  };

  const toggleUrl = (url: string) => {
    setSelectedUrls((prev) =>
      prev.includes(url) ? prev.filter((item) => item !== url) : [...prev, url],
    );
  };

  /** 使用者提供的來源加上 admin 補的，同一份勾選清單 */
  const candidateUrls = useMemo(
    () => [...(selectedReport?.user_source_urls ?? []), ...extraUrls],
    [selectedReport, extraUrls],
  );

  const addUrl = () => {
    const url = urlDraft.trim();
    // 白名單由後端把關（is_allowed_url），前端只擋空值與重複
    if (!url || candidateUrls.includes(url)) return;
    setExtraUrls((prev) => [...prev, url]);
    setSelectedUrls((prev) => [...prev, url]);
    setUrlDraft('');
  };

  // 後端在 selected_urls 為空時會退回全選，所以「一個都沒選」必須擋在前端
  const canApprove = selectedReport !== null && selectedUrls.length > 0;

  const handleAction = async (action: 'approve' | 'reject') => {
    if (!selectedReport) return;
    if (action === 'approve' && !canApprove) return;
    setActionLoading(true);
    setActionError(null);
    const note = reviewerNote.trim();
    try {
      if (action === 'approve') {
        await approveKnowledgeReport(selectedReport.report_id, {
          selected_urls: selectedUrls,
          ...(note ? { reviewer_note: note } : {}),
        });
      } else {
        await rejectKnowledgeReport(selectedReport.report_id, note ? { reviewer_note: note } : {});
      }
      closeDialog();
      await reloadReports();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('adminKnowledgeReports.actionError'));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <KnowledgePage>
      <KnowledgeHero
        avatar={t('adminKnowledgeReports.avatar')}
        eyebrow={t('adminKnowledgeReports.eyebrow')}
        title={
          <DecryptedText
            text={t('adminKnowledgeReports.title')}
            speed={34}
            sequential
            revealDirection="center"
            useOriginalCharsOnly
            animateOn="view"
          />
        }
        stats={
          <StatsRow
            label={t('adminKnowledgeReports.statsLabel')}
            items={[
              { value: counts.all ?? 0, label: t('adminKnowledgeReports.stats.queue') },
              { value: counts.pending ?? 0, label: t('adminKnowledgeReports.stats.pending') },
              { value: counts.reviewing ?? 0, label: t('adminKnowledgeReports.stats.reviewing') },
            ]}
          />
        }
      />

      <section aria-labelledby="admin-knowledge-list-title" className="flex flex-col gap-3">
        <h2 id="admin-knowledge-list-title" className="sr-only">
          {t('adminKnowledgeReports.listTitle')}
        </h2>

        {/* 篩選是互斥單選 → Tabs（與使用者端同一組元件）。
            舊版用 ToggleGroup 撐一排按鈕，窄螢幕會被切出畫面外。 */}
        <Tabs
          value={activeFilter}
          onValueChange={(value) => setActiveFilter(value as QueueFilter)}
        >
          <TabsList
            className="w-full justify-start overflow-x-auto min-[640px]:w-fit [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label={t('adminKnowledgeReports.filterLabel')}
          >
            {filters.map((filter) => (
              <TabsTrigger key={filter.value} value={filter.value} className="flex-none px-2.5">
                {filter.label}
                {counts[filter.value] !== undefined && (
                  <Badge variant="secondary" className="px-1.5 tabular-nums">
                    {counts[filter.value]}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {loading ? (
          <ReportsLoading label={t('adminKnowledgeReports.loading')} />
        ) : error ? (
          <ReportsEmpty
            icon={<TriangleAlertIcon />}
            title={t('adminKnowledgeReports.loadError')}
            description={error}
          />
        ) : reports.length === 0 ? (
          <ReportsEmpty
            icon={<CheckIcon />}
            title={t('adminKnowledgeReports.emptyAllTitle')}
            description={t('adminKnowledgeReports.emptyAllDesc')}
          />
        ) : (
          <>
            <ItemGroup className="gap-3">
              {reports.map((report, index) => (
                <ReportRow
                  key={report.report_id}
                  index={index}
                  status={report.status}
                  statusLabel={statusLabel[report.status]}
                  question={report.question}
                  ariaLabel={t('adminKnowledgeReports.viewReport', { question: report.question })}
                  tags={
                    <>
                      <ReportTag status={report.status}>
                        {mapReasonLabel(report.reason, t)}
                      </ReportTag>
                      {/* ingest 進行中／失敗都停在 reviewing，沒有這個標記兩者長得一樣 */}
                      {isIngestRunning(report.ingest_job) && (
                        <ReportTag status="reviewing">
                          {t('adminKnowledgeReports.ingest.running')}
                        </ReportTag>
                      )}
                      {isIngestFailed(report.ingest_job) && (
                        <ReportTag status="rejected">
                          {t('adminKnowledgeReports.ingest.failed')}
                        </ReportTag>
                      )}
                    </>
                  }
                  submittedAt={t('knowledgeReports.submittedAtValue', {
                    date: formatSubmittedAt(report.created_at),
                  })}
                  reviewLabel={t('adminKnowledgeReports.userNote')}
                  reviewText={report.user_note?.trim() || t('adminKnowledgeReports.noUserNote')}
                  onClick={() => openDialog(report)}
                />
              ))}
            </ItemGroup>

            {hasNextPage && (
              <div className="mt-4 flex flex-col items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  {t('adminKnowledgeReports.loadedCount', {
                    loaded: reports.length,
                    total: totalCount,
                  })}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage
                    ? t('adminKnowledgeReports.loading')
                    : t('adminKnowledgeReports.loadMore')}
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Dialog 取代手刻遮罩：焦點鎖定、Escape、焦點歸位、背景鎖捲皆內建 */}
      <Dialog open={selectedReport !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent
          // 整個 DialogContent 一起捲，會把 absolute 定位的關閉鈕一起捲走；
          // 改三段式 grid，只有中間內容區可捲，標題與底部按鈕固定
          className="max-h-[calc(100dvh-48px)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-[560px]"
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
                    aria-label={t('adminKnowledgeReports.closeDetail')}
                    disabled={actionLoading}
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
                    {selectedReport.report_id}
                  </span>
                </div>
                <DialogTitle className="text-2xl leading-snug text-balance">
                  {selectedReport.question}
                </DialogTitle>
              </DialogHeader>

              {/* 只有這一段可捲，關閉鈕與底部審核按鈕固定在對話框上下 */}
              <div className="grid gap-6 overflow-y-auto">
                <DetailList>
                  <DetailItem term={t('adminKnowledgeReports.detail.reason')}>
                    {mapReasonLabel(selectedReport.reason, t)}
                  </DetailItem>
                  <DetailItem term={t('adminKnowledgeReports.detail.userNote')}>
                    {selectedReport.user_note?.trim() || t('adminKnowledgeReports.noUserNote')}
                  </DetailItem>

                  <DetailItem term={t('adminKnowledgeReports.detail.sourceUrls')}>
                    {candidateUrls.length === 0 ? (
                      <p className="mb-2">{t('adminKnowledgeReports.noSourceUrls')}</p>
                    ) : (
                      <>
                        <p className="mb-2 text-xs text-muted-foreground">
                          {t('adminKnowledgeReports.selectUrlsHint')}
                        </p>
                        <ul className="list-none">
                          {candidateUrls.map((url) => (
                            // 不用 FieldLabel 綁 htmlFor：連結不該包在 label 裡
                            // （點文字會變成切換勾選而不是開連結），而且 label 一綁上去
                            // 就會產生 aria-labelledby，蓋掉 checkbox 自己的 aria-label
                            <li key={url} className="mb-2 flex items-start gap-2">
                              <Checkbox
                                checked={selectedUrls.includes(url)}
                                onCheckedChange={() => toggleUrl(url)}
                                disabled={actionLoading}
                                aria-label={t('adminKnowledgeReports.selectUrl', { url })}
                                className="mt-1"
                              />
                              <a
                                className="break-all text-primary underline-offset-4 hover:underline"
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {url}
                              </a>
                              {extraUrls.includes(url) && (
                                <Badge variant="secondary" className="shrink-0">
                                  {t('adminKnowledgeReports.adminAddedUrl')}
                                </Badge>
                              )}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}

                    {/* 使用者回報多半沒附來源，admin 要能自己補上權威網址 */}
                    <div className="mt-2 flex gap-2">
                      <Input
                        type="url"
                        className="min-w-0 flex-1"
                        value={urlDraft}
                        onChange={(event) => setUrlDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addUrl();
                          }
                        }}
                        placeholder={t('adminKnowledgeReports.addUrlPlaceholder')}
                        aria-label={t('adminKnowledgeReports.addUrlLabel')}
                        disabled={actionLoading}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="shrink-0"
                        onClick={addUrl}
                        disabled={actionLoading || urlDraft.trim().length === 0}
                      >
                        {t('adminKnowledgeReports.addUrl')}
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('adminKnowledgeReports.addUrlHint')}
                    </p>

                    {selectedUrls.length === 0 && (
                      <p className="mt-2 text-sm font-semibold text-destructive">
                        {t('adminKnowledgeReports.selectUrlsRequired')}
                      </p>
                    )}
                  </DetailItem>

                  <DetailItem term={t('adminKnowledgeReports.detail.status')}>
                    {statusLabel[selectedReport.status]}
                  </DetailItem>

                  {selectedReport.ingest_job?.status && (
                    <DetailItem term={t('adminKnowledgeReports.detail.ingest')}>
                      <p className="mb-2">
                        {t(`adminKnowledgeReports.ingest.${selectedReport.ingest_job.status}`)}
                      </p>
                      {selectedReport.ingest_job.error && (
                        <Alert variant="destructive" className="mb-2">
                          <AlertDescription className="break-all">
                            {selectedReport.ingest_job.error}
                          </AlertDescription>
                        </Alert>
                      )}
                      {selectedReport.ingest_job.results.length > 0 && (
                        <ul className="list-disc pl-5">
                          {selectedReport.ingest_job.results.map((result) => (
                            <li key={result.url} className="break-all">
                              {t('adminKnowledgeReports.ingest.resultLine', {
                                url: result.url,
                                status: result.status,
                                chunks: result.chunk_count,
                              })}
                              {result.message ? `：${result.message}` : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </DetailItem>
                  )}
                </DetailList>

                <Field>
                  <FieldLabel htmlFor="reviewer-note">
                    {t('adminKnowledgeReports.reviewerNoteLabel')}
                  </FieldLabel>
                  <Textarea
                    id="reviewer-note"
                    className="resize-y"
                    value={reviewerNote}
                    onChange={(event) => setReviewerNote(event.target.value)}
                    placeholder={t('adminKnowledgeReports.reviewerNotePlaceholder')}
                    rows={3}
                    disabled={actionLoading}
                  />
                </Field>

                {actionError && (
                  <Alert variant="destructive">
                    <AlertDescription>{actionError}</AlertDescription>
                  </Alert>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void handleAction('reject')}
                  disabled={actionLoading}
                >
                  {actionLoading
                    ? t('adminKnowledgeReports.actionLoading')
                    : t('adminKnowledgeReports.reject')}
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleAction('approve')}
                  disabled={actionLoading || !canApprove}
                >
                  {actionLoading
                    ? t('adminKnowledgeReports.actionLoading')
                    : isIngestFailed(selectedReport.ingest_job)
                      ? t('adminKnowledgeReports.retry')
                      : t('adminKnowledgeReports.approve')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </KnowledgePage>
  );
}

export default AdminKnowledgeReportsPage;

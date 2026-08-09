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
import { cn } from '@/lib/utils';
import { queryKeys } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Textarea } from '@/components/ui/textarea';
// 與 KnowledgeReports 共用同一組樣式常數（原本是共用同一份 index.css）
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import * as S from '../KnowledgeReports/styles';

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

  const statusMeta: Record<KnowledgeReportStatus, { label: string; icon: string }> = {
    pending: { label: t('knowledgeReports.status.pending'), icon: '○' },
    reviewing: { label: t('knowledgeReports.status.reviewing'), icon: '◌' },
    resolved: { label: t('knowledgeReports.status.resolved'), icon: '✓' },
    rejected: { label: t('knowledgeReports.status.rejected'), icon: '×' },
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
    <div className={S.PAGE}>
      {/* 管理版 hero 僅單欄；min-h-0 蓋掉共用卡片的 280px 最小高度 */}
      <section className={cn(S.HERO, 'grid-cols-1')}>
        <div className={cn(S.HERO_CARD, 'min-h-0')}>
          <div className={cn(S.SUMMARY, 'min-h-0')}>
            <div className={S.AVATAR} aria-hidden="true">
              {t('adminKnowledgeReports.avatar')}
            </div>
            <div className="self-center">
              <span className={S.EYEBROW}>{t('adminKnowledgeReports.eyebrow')}</span>
              <h1 className={S.SUMMARY_H1}>
                <DecryptedText
                  text={t('adminKnowledgeReports.title')}
                  speed={34}
                  sequential
                  revealDirection="center"
                  useOriginalCharsOnly
                  animateOn="view"
                />
              </h1>
            </div>

            <div className={S.STATS} aria-label={t('adminKnowledgeReports.statsLabel')}>
              <div className={S.STATS_ITEM}>
                <strong className={S.STATS_NUM}>{counts.all ?? 0}</strong>
                <span className={S.STATS_LABEL}>{t('adminKnowledgeReports.stats.queue')}</span>
              </div>
              <div className={S.STATS_ITEM}>
                <strong className={S.STATS_NUM}>{counts.pending ?? 0}</strong>
                <span className={S.STATS_LABEL}>{t('adminKnowledgeReports.stats.pending')}</span>
              </div>
              <div className={S.STATS_ITEM}>
                <strong className={S.STATS_NUM}>{counts.reviewing ?? 0}</strong>
                <span className={S.STATS_LABEL}>{t('adminKnowledgeReports.stats.reviewing')}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={S.LIST_SECTION} aria-labelledby="admin-knowledge-list-title">
        <div className={S.LIST_HEADER}>
          {/* 篩選是互斥單選 → ToggleGroup（原本是一排各自 aria-pressed 的按鈕） */}
          <ToggleGroup
            className={S.TABS}
            value={[activeFilter]}
            onValueChange={(groupValue) => {
              const next = groupValue[0] as QueueFilter | undefined;
              if (next) setActiveFilter(next);
            }}
            aria-label={t('adminKnowledgeReports.filterLabel')}
          >
            {filters.map((filter) => (
              <ToggleGroupItem
                key={filter.value}
                value={filter.value}
                className={cn(S.TAB_BTN, S.TAB_ACTIVE_VARIANT)}
              >
                {filter.label}
                {counts[filter.value] !== undefined && <span>{counts[filter.value]}</span>}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <h2 id="admin-knowledge-list-title" className="sr-only">
          {t('adminKnowledgeReports.listTitle')}
        </h2>

        {loading ? (
          <div className={S.EMPTY}>
            <p className={S.EMPTY_P}>{t('adminKnowledgeReports.loading')}</p>
          </div>
        ) : error ? (
          <div className={S.EMPTY}>
            <span className={S.EMPTY_ICON} aria-hidden="true">!</span>
            <h3 className={S.EMPTY_H3}>{t('adminKnowledgeReports.loadError')}</h3>
            <p className={S.EMPTY_P}>{error}</p>
          </div>
        ) : reports.length === 0 ? (
          <div className={S.EMPTY}>
            <span className={S.EMPTY_ICON} aria-hidden="true">✓</span>
            <h3 className={S.EMPTY_H3}>{t('adminKnowledgeReports.emptyAllTitle')}</h3>
            <p className={S.EMPTY_P}>{t('adminKnowledgeReports.emptyAllDesc')}</p>
          </div>
        ) : (
          <div className={S.REPORT_LIST}>
            {reports.map((report) => (
              <button
                key={report.report_id}
                type="button"
                className={S.REPORT_CARD}
                onClick={() => openDialog(report)}
                aria-label={t('adminKnowledgeReports.viewReport', { question: report.question })}
              >
                <span className={cn(S.REPORT_ICON, S.STATUS_TONE_SOFT[report.status])} aria-hidden="true">
                  {report.status === 'reviewing' ? '◌' : '!'}
                </span>

                <span className={S.REPORT_QUESTION}>
                  <strong className={S.REPORT_QUESTION_STRONG}>{report.question}</strong>
                  <span className={S.REPORT_META}>
                    <span className={cn(S.REASON_TAG, S.STATUS_TONE_SOFT[report.status])}>
                      {mapReasonLabel(report.reason, t)}
                    </span>
                    {/* ingest 進行中／失敗都停在 reviewing，沒有這個標記兩者長得一樣 */}
                    {isIngestRunning(report.ingest_job) && (
                      <span className={cn(S.REASON_TAG, S.STATUS_TONE_SOFT.reviewing)}>
                        {t('adminKnowledgeReports.ingest.running')}
                      </span>
                    )}
                    {isIngestFailed(report.ingest_job) && (
                      <span className={cn(S.REASON_TAG, S.STATUS_TONE_SOFT.rejected)}>
                        {t('adminKnowledgeReports.ingest.failed')}
                      </span>
                    )}
                    <time className={S.META_MUTED}>
                      {t('knowledgeReports.submittedAtValue', {
                        date: formatSubmittedAt(report.created_at),
                      })}
                    </time>
                  </span>
                </span>

                <span className={S.REPORT_REVIEW}>
                  <small className={S.META_MUTED}>{t('adminKnowledgeReports.userNote')}</small>
                  <span className={S.REPORT_REVIEW_TEXT}>
                    {report.user_note?.trim() || t('adminKnowledgeReports.noUserNote')}
                  </span>
                </span>

                <span className={cn(S.STATUS_BADGE, S.STATUS_BADGE_TONE[report.status], S.CARD_STATUS_POS)}>
                  {statusMeta[report.status].icon}
                  {statusMeta[report.status].label}
                </span>
                <span className={S.CHEVRON} aria-hidden="true">›</span>
              </button>
            ))}

            {hasNextPage && (
              <div className="mt-4 flex flex-col items-center gap-2">
                <p className="m-0 text-[0.78rem] text-muted-foreground">
                  {t('adminKnowledgeReports.loadedCount', {
                    loaded: reports.length,
                    total: totalCount,
                  })}
                </p>
                <Button
                  type="button"
                  className="min-h-[42px] rounded-full border border-hair bg-surface-2 px-[18px] font-[750] text-foreground hover:bg-surface-2/80"
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage
                    ? t('adminKnowledgeReports.loading')
                    : t('adminKnowledgeReports.loadMore')}
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Dialog 取代手刻遮罩：焦點鎖定、Escape、焦點歸位、背景鎖捲皆內建 */}
      <Dialog open={selectedReport !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className={S.DIALOG} showCloseButton={false}>
          {selectedReport && (
            <>
              <DialogClose
                render={
                  <button
                    type="button"
                    className={S.DIALOG_CLOSE}
                    aria-label={t('adminKnowledgeReports.closeDetail')}
              disabled={actionLoading}
                  >
                    ×
                  </button>
                }
              />
            <span className={cn(S.STATUS_BADGE, S.STATUS_BADGE_TONE[selectedReport.status])}>
              {statusMeta[selectedReport.status].icon}
              {statusMeta[selectedReport.status].label}
            </span>
            <p className={S.DIALOG_ID}>{selectedReport.report_id}</p>
            <DialogTitle className={S.DIALOG_H2}>{selectedReport.question}</DialogTitle>
            <dl className={S.DIALOG_DL}>
              <div className={S.DIALOG_ITEM}>
                <dt className={S.DIALOG_DT}>{t('adminKnowledgeReports.detail.reason')}</dt>
                <dd className={S.DIALOG_DD}>{mapReasonLabel(selectedReport.reason, t)}</dd>
              </div>
              <div className={S.DIALOG_ITEM}>
                <dt className={S.DIALOG_DT}>{t('adminKnowledgeReports.detail.userNote')}</dt>
                <dd className={S.DIALOG_DD}>
                  {selectedReport.user_note?.trim() || t('adminKnowledgeReports.noUserNote')}
                </dd>
              </div>
              <div className={S.DIALOG_ITEM}>
                <dt className={S.DIALOG_DT}>{t('adminKnowledgeReports.detail.sourceUrls')}</dt>
                <dd className={S.DIALOG_DD}>
                  {candidateUrls.length === 0 ? (
                    <p className="mt-0 mb-2">{t('adminKnowledgeReports.noSourceUrls')}</p>
                  ) : (
                    <>
                      <p className="mt-0 mb-2 text-[0.76rem] text-muted-foreground">
                        {t('adminKnowledgeReports.selectUrlsHint')}
                      </p>
                      <ul className="m-0 list-none p-0">
                        {candidateUrls.map((url) => (
                          <li key={url} className="mb-2 flex items-start gap-2">
                            <input
                              type="checkbox"
                              className="mt-[0.2rem] size-4 shrink-0 accent-[var(--primary-strong)]"
                              checked={selectedUrls.includes(url)}
                              onChange={() => toggleUrl(url)}
                              disabled={actionLoading}
                              aria-label={t('adminKnowledgeReports.selectUrl', { url })}
                            />
                            <a
                              className="break-all text-[var(--primary-strong)]"
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {url}
                            </a>
                            {extraUrls.includes(url) && (
                              <span className="shrink-0 text-[0.7rem] text-muted-foreground">
                                {t('adminKnowledgeReports.adminAddedUrl')}
                              </span>
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
                      className="min-w-0 flex-1 rounded-md border-hair bg-surface-2 text-foreground"
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
                      className="min-h-[38px] shrink-0 rounded-full border border-hair bg-surface-2 px-4 font-[750] text-foreground hover:bg-surface-2/80"
                      onClick={addUrl}
                      disabled={actionLoading || urlDraft.trim().length === 0}
                    >
                      {t('adminKnowledgeReports.addUrl')}
                    </Button>
                  </div>
                  <p className="mt-1 mb-0 text-[0.72rem] text-muted-foreground">
                    {t('adminKnowledgeReports.addUrlHint')}
                  </p>

                  {selectedUrls.length === 0 && (
                    <p className="mt-2 mb-0 text-[0.78rem] font-[650] text-destructive">
                      {t('adminKnowledgeReports.selectUrlsRequired')}
                    </p>
                  )}
                </dd>
              </div>
              <div className={S.DIALOG_ITEM}>
                <dt className={S.DIALOG_DT}>{t('adminKnowledgeReports.detail.status')}</dt>
                <dd className={S.DIALOG_DD}>{statusMeta[selectedReport.status].label}</dd>
              </div>
              {selectedReport.ingest_job?.status && (
                <div className={S.DIALOG_ITEM}>
                  <dt className={S.DIALOG_DT}>{t('adminKnowledgeReports.detail.ingest')}</dt>
                  <dd className={S.DIALOG_DD}>
                    <p className="mt-0 mb-2">
                      {t(`adminKnowledgeReports.ingest.${selectedReport.ingest_job.status}`)}
                    </p>
                    {selectedReport.ingest_job.error && (
                      <p
                        className="mt-0 mb-2 break-all font-[650] text-destructive"
                        role="alert"
                      >
                        {selectedReport.ingest_job.error}
                      </p>
                    )}
                    {selectedReport.ingest_job.results.length > 0 && (
                      <ul className="m-0 pl-[1.1rem]">
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
                  </dd>
                </div>
              )}
            </dl>

            <label className="mt-6 grid gap-2">
              <span className="text-[0.76rem] font-[750] text-muted-foreground">
                {t('adminKnowledgeReports.reviewerNoteLabel')}
              </span>
              <Textarea
                className="resize-y rounded-md border-hair bg-surface-2 p-3 text-foreground disabled:opacity-70"
                value={reviewerNote}
                onChange={(event) => setReviewerNote(event.target.value)}
                placeholder={t('adminKnowledgeReports.reviewerNotePlaceholder')}
                rows={3}
                disabled={actionLoading}
              />
            </label>

            {actionError && (
              <p className="mt-3 mb-0 text-[0.86rem] font-[650] text-destructive" role="alert">
                {actionError}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                className="min-h-[42px] rounded-full border border-transparent bg-destructive-soft px-[18px] font-[750] text-destructive hover:bg-destructive-soft/80"
                onClick={() => void handleAction('reject')}
                disabled={actionLoading}
              >
                {actionLoading
                  ? t('adminKnowledgeReports.actionLoading')
                  : t('adminKnowledgeReports.reject')}
              </Button>
              <Button
                type="button"
                className="min-h-[42px] rounded-full border-0 bg-ink px-[18px] font-[750] text-white hover:bg-ink/90"
                onClick={() => void handleAction('approve')}
                disabled={actionLoading || !canApprove}
              >
                {actionLoading
                  ? t('adminKnowledgeReports.actionLoading')
                  : isIngestFailed(selectedReport.ingest_job)
                    ? t('adminKnowledgeReports.retry')
                    : t('adminKnowledgeReports.approve')}
              </Button>
            </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminKnowledgeReportsPage;

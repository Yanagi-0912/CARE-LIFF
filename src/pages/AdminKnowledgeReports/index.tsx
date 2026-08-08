import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DecryptedText from '../../components/DecryptedText/DecryptedText';
import {
  approveKnowledgeReport,
  fetchAdminKnowledgeReports,
  rejectKnowledgeReport,
  type KnowledgeReportDto,
  type KnowledgeReportReason,
  type KnowledgeReportStatus,
} from '../../api/knowledgeReportsApi';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Textarea } from '@/components/ui/textarea';
// 與 KnowledgeReports 共用同一組樣式常數（原本是共用同一份 index.css）
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import * as S from '../KnowledgeReports/styles';

type QueueFilter = 'all' | 'pending' | 'reviewing';

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
  const [rawReports, setRawReports] = useState<KnowledgeReportDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<KnowledgeReportDto | null>(null);
  const [reviewerNote, setReviewerNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchAdminKnowledgeReports();
      setRawReports(response.reports);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminKnowledgeReports.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchAdminKnowledgeReports();
        if (!cancelled) {
          setRawReports(response.reports);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('adminKnowledgeReports.loadError'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [t]);

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

  const counts = useMemo(() => {
    const pending = rawReports.filter((r) => r.status === 'pending').length;
    const reviewing = rawReports.filter((r) => r.status === 'reviewing').length;
    return {
      all: rawReports.length,
      pending,
      reviewing,
    };
  }, [rawReports]);

  const visibleReports =
    activeFilter === 'all'
      ? rawReports
      : rawReports.filter((report) => report.status === activeFilter);

  const closeDialog = () => {
    setSelectedReport(null);
    setReviewerNote('');
    setActionError(null);
  };

  const handleAction = async (action: 'approve' | 'reject') => {
    if (!selectedReport) return;
    setActionLoading(true);
    setActionError(null);
    const note = reviewerNote.trim();
    const body = note ? { reviewer_note: note } : undefined;
    try {
      if (action === 'approve') {
        await approveKnowledgeReport(selectedReport.report_id, body ?? {});
      } else {
        await rejectKnowledgeReport(selectedReport.report_id, body ?? {});
      }
      closeDialog();
      await loadReports();
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
                <strong className={S.STATS_NUM}>{counts.all}</strong>
                <span className={S.STATS_LABEL}>{t('adminKnowledgeReports.stats.queue')}</span>
              </div>
              <div className={S.STATS_ITEM}>
                <strong className={S.STATS_NUM}>{counts.pending}</strong>
                <span className={S.STATS_LABEL}>{t('adminKnowledgeReports.stats.pending')}</span>
              </div>
              <div className={S.STATS_ITEM}>
                <strong className={S.STATS_NUM}>{counts.reviewing}</strong>
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
                <span>{counts[filter.value]}</span>
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
        ) : rawReports.length === 0 ? (
          <div className={S.EMPTY}>
            <span className={S.EMPTY_ICON} aria-hidden="true">✓</span>
            <h3 className={S.EMPTY_H3}>{t('adminKnowledgeReports.emptyAllTitle')}</h3>
            <p className={S.EMPTY_P}>{t('adminKnowledgeReports.emptyAllDesc')}</p>
          </div>
        ) : visibleReports.length === 0 ? (
          <div className={S.EMPTY}>
            <span className={S.EMPTY_ICON} aria-hidden="true">✓</span>
            <h3 className={S.EMPTY_H3}>{t('adminKnowledgeReports.emptyAllTitle')}</h3>
            <p className={S.EMPTY_P}>{t('adminKnowledgeReports.emptyAllDesc')}</p>
          </div>
        ) : (
          <div className={S.REPORT_LIST}>
            {visibleReports.map((report) => (
              <button
                key={report.report_id}
                type="button"
                className={S.REPORT_CARD}
                onClick={() => {
                  setSelectedReport(report);
                  setReviewerNote('');
                  setActionError(null);
                }}
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
                  {selectedReport.user_source_urls.length === 0 ? (
                    t('adminKnowledgeReports.noSourceUrls')
                  ) : (
                    <ul className="m-0 pl-[1.1rem]">
                      {selectedReport.user_source_urls.map((url) => (
                        <li key={url}>
                          <a
                            className="break-all text-[var(--primary-strong)]"
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
              <div className={S.DIALOG_ITEM}>
                <dt className={S.DIALOG_DT}>{t('adminKnowledgeReports.detail.status')}</dt>
                <dd className={S.DIALOG_DD}>{statusMeta[selectedReport.status].label}</dd>
              </div>
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
                disabled={actionLoading}
              >
                {actionLoading
                  ? t('adminKnowledgeReports.actionLoading')
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

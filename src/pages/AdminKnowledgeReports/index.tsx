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
import '../KnowledgeReports/index.css';
import './index.css';

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
    <div className="knowledgeReportsPage adminKnowledgeReportsPage">
      <section className="knowledgeHero adminKnowledgeHero">
        <div className="knowledgeSummaryCard">
          <div className="knowledgeSummary">
            <div className="knowledgeAvatar" aria-hidden="true">
              {t('adminKnowledgeReports.avatar')}
            </div>
            <div className="knowledgeSummaryCopy">
              <span className="knowledgeEyebrow">{t('adminKnowledgeReports.eyebrow')}</span>
              <h1>
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

            <div className="knowledgeStats" aria-label={t('adminKnowledgeReports.statsLabel')}>
              <div>
                <strong>{counts.all}</strong>
                <span>{t('adminKnowledgeReports.stats.queue')}</span>
              </div>
              <div>
                <strong>{counts.pending}</strong>
                <span>{t('adminKnowledgeReports.stats.pending')}</span>
              </div>
              <div>
                <strong>{counts.reviewing}</strong>
                <span>{t('adminKnowledgeReports.stats.reviewing')}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="knowledgeListSection" aria-labelledby="admin-knowledge-list-title">
        <div className="knowledgeListHeader">
          <div className="knowledgeTabs" role="group" aria-label={t('adminKnowledgeReports.filterLabel')}>
            {filters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={activeFilter === filter.value ? 'isActive' : ''}
                aria-pressed={activeFilter === filter.value}
                onClick={() => setActiveFilter(filter.value)}
              >
                {filter.label}
                <span>{counts[filter.value]}</span>
              </button>
            ))}
          </div>
        </div>

        <h2 id="admin-knowledge-list-title" className="visuallyHidden">
          {t('adminKnowledgeReports.listTitle')}
        </h2>

        {loading ? (
          <div className="knowledgeEmpty">
            <p>{t('adminKnowledgeReports.loading')}</p>
          </div>
        ) : error ? (
          <div className="knowledgeEmpty">
            <span aria-hidden="true">!</span>
            <h3>{t('adminKnowledgeReports.loadError')}</h3>
            <p>{error}</p>
          </div>
        ) : rawReports.length === 0 ? (
          <div className="knowledgeEmpty">
            <span aria-hidden="true">✓</span>
            <h3>{t('adminKnowledgeReports.emptyAllTitle')}</h3>
            <p>{t('adminKnowledgeReports.emptyAllDesc')}</p>
          </div>
        ) : visibleReports.length === 0 ? (
          <div className="knowledgeEmpty">
            <span aria-hidden="true">✓</span>
            <h3>{t('adminKnowledgeReports.emptyAllTitle')}</h3>
            <p>{t('adminKnowledgeReports.emptyAllDesc')}</p>
          </div>
        ) : (
          <div className="knowledgeReportList">
            {visibleReports.map((report) => (
              <button
                key={report.report_id}
                type="button"
                className={`knowledgeReportCard report-${report.status}`}
                onClick={() => {
                  setSelectedReport(report);
                  setReviewerNote('');
                  setActionError(null);
                }}
                aria-label={t('adminKnowledgeReports.viewReport', { question: report.question })}
              >
                <span className="reportIcon" aria-hidden="true">
                  {report.status === 'reviewing' ? '◌' : '!'}
                </span>

                <span className="reportQuestion">
                  <strong>{report.question}</strong>
                  <span className="reportMeta">
                    <span className={`reasonTag reason-${report.status}`}>
                      {mapReasonLabel(report.reason, t)}
                    </span>
                    <time>
                      {t('knowledgeReports.submittedAtValue', {
                        date: formatSubmittedAt(report.created_at),
                      })}
                    </time>
                  </span>
                </span>

                <span className="reportReview">
                  <small>{t('adminKnowledgeReports.userNote')}</small>
                  <span>
                    {report.user_note?.trim() || t('adminKnowledgeReports.noUserNote')}
                  </span>
                </span>

                <span className={`knowledgeStatus status-${report.status}`}>
                  {statusMeta[report.status].icon}
                  {statusMeta[report.status].label}
                </span>
                <span className="reportChevron" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedReport && (
        <div
          className="reportDialogBackdrop"
          role="presentation"
          onMouseDown={closeDialog}
        >
          <section
            className="reportDialog adminReportDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-report-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="reportDialogClose"
              type="button"
              aria-label={t('adminKnowledgeReports.closeDetail')}
              onClick={closeDialog}
              disabled={actionLoading}
            >
              ×
            </button>
            <span className={`knowledgeStatus status-${selectedReport.status}`}>
              {statusMeta[selectedReport.status].icon}
              {statusMeta[selectedReport.status].label}
            </span>
            <p className="reportDialogId">{selectedReport.report_id}</p>
            <h2 id="admin-report-dialog-title">{selectedReport.question}</h2>
            <dl>
              <div>
                <dt>{t('adminKnowledgeReports.detail.reason')}</dt>
                <dd>{mapReasonLabel(selectedReport.reason, t)}</dd>
              </div>
              <div>
                <dt>{t('adminKnowledgeReports.detail.userNote')}</dt>
                <dd>
                  {selectedReport.user_note?.trim() || t('adminKnowledgeReports.noUserNote')}
                </dd>
              </div>
              <div>
                <dt>{t('adminKnowledgeReports.detail.sourceUrls')}</dt>
                <dd>
                  {selectedReport.user_source_urls.length === 0 ? (
                    t('adminKnowledgeReports.noSourceUrls')
                  ) : (
                    <ul className="adminSourceUrlList">
                      {selectedReport.user_source_urls.map((url) => (
                        <li key={url}>
                          <a href={url} target="_blank" rel="noopener noreferrer">
                            {url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
              <div>
                <dt>{t('adminKnowledgeReports.detail.status')}</dt>
                <dd>{statusMeta[selectedReport.status].label}</dd>
              </div>
            </dl>

            <label className="adminReviewerNoteField">
              <span>{t('adminKnowledgeReports.reviewerNoteLabel')}</span>
              <textarea
                value={reviewerNote}
                onChange={(event) => setReviewerNote(event.target.value)}
                placeholder={t('adminKnowledgeReports.reviewerNotePlaceholder')}
                rows={3}
                disabled={actionLoading}
              />
            </label>

            {actionError && (
              <p className="adminActionError" role="alert">
                {actionError}
              </p>
            )}

            <div className="adminDialogActions">
              <button
                type="button"
                className="adminRejectButton"
                onClick={() => void handleAction('reject')}
                disabled={actionLoading}
              >
                {actionLoading
                  ? t('adminKnowledgeReports.actionLoading')
                  : t('adminKnowledgeReports.reject')}
              </button>
              <button
                type="button"
                className="adminApproveButton"
                onClick={() => void handleAction('approve')}
                disabled={actionLoading}
              >
                {actionLoading
                  ? t('adminKnowledgeReports.actionLoading')
                  : t('adminKnowledgeReports.approve')}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default AdminKnowledgeReportsPage;

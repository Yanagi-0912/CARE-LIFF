import { useEffect, useMemo, useState } from 'react';
import liff from '@line/liff';
import { useTranslation } from 'react-i18next';
import DecryptedText from '../../components/DecryptedText/DecryptedText';
import {
  fetchKnowledgeReports,
  type KnowledgeReportDto,
  type KnowledgeReportReason,
  type KnowledgeReportStatus,
} from '../../api/knowledgeReportsApi';
import { cn } from '@/lib/utils';
import * as S from './styles';

type ReportFilter = 'all' | KnowledgeReportStatus;

interface KnowledgeReport {
  id: string;
  question: string;
  reason: string;
  status: KnowledgeReportStatus;
  submittedAt: string;
  reviewerNote: string;
  resolution?: string;
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
  return {
    id: report.report_id,
    question: report.question,
    reason: mapReasonLabel(report.reason, t),
    status: report.status,
    submittedAt: formatSubmittedAt(report.created_at),
    reviewerNote: report.reviewer_note?.trim() || t('knowledgeReports.noReviewerNote'),
    resolution: report.resolution?.trim() || undefined,
  };
}

function KnowledgeReportsPage() {
  const { t } = useTranslation();
  const [activeFilter, setActiveFilter] = useState<ReportFilter>('all');
  const [selectedReport, setSelectedReport] = useState<KnowledgeReport | null>(null);
  const [rawReports, setRawReports] = useState<KnowledgeReportDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchKnowledgeReports();
        if (!cancelled) {
          setRawReports(response.reports);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('knowledgeReports.loadError'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadReports();

    return () => {
      cancelled = true;
    };
  }, [t]);

  const reports = useMemo(
    () => rawReports.map((report) => mapReportDto(report, t)),
    [rawReports, t],
  );

  const statusMeta: Record<KnowledgeReportStatus, { label: string; icon: string }> = {
    pending: { label: t('knowledgeReports.status.pending'), icon: '○' },
    reviewing: { label: t('knowledgeReports.status.reviewing'), icon: '◌' },
    resolved: { label: t('knowledgeReports.status.resolved'), icon: '✓' },
    rejected: { label: t('knowledgeReports.status.rejected'), icon: '×' },
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

  const visibleReports =
    activeFilter === 'all'
      ? reports
      : reports.filter((report) => report.status === activeFilter);

  const latestReport = reports[0];

  const handleAskInLine = () => {
    if (liff.isInClient()) {
      liff.closeWindow();
      return;
    }

    window.alert(t('knowledgeReports.lineFallback'));
  };

  return (
    <div className={S.PAGE}>
      <div className={S.NOTICE_CARD}>
        <section className={S.NOTICE} aria-label={t('knowledgeReports.noticeLabel')}>
          <span className={S.NOTICE_ICON} aria-hidden="true">?</span>
          <p className={S.NOTICE_TEXT}>{t('knowledgeReports.notice')}</p>
          <button type="button" className={S.NOTICE_BTN} onClick={handleAskInLine}>
            {t('knowledgeReports.backToLine')}
            <span aria-hidden="true">›</span>
          </button>
        </section>
      </div>

      <section className={S.HERO}>
        <div className={S.HERO_CARD}>
          <div className={S.SUMMARY}>
            <div className={S.AVATAR} aria-hidden="true">{t('knowledgeReports.avatar')}</div>
            <div className="self-center">
              <span className={S.EYEBROW}>{t('knowledgeReports.eyebrow')}</span>
              <h1 className={S.SUMMARY_H1}>
                <DecryptedText
                  text={t('knowledgeReports.title')}
                  speed={34}
                  sequential
                  revealDirection="center"
                  useOriginalCharsOnly
                  animateOn="view"
                />
              </h1>
            </div>

            <div className={S.STATS} aria-label={t('knowledgeReports.statsLabel')}>
              <div className={S.STATS_ITEM}>
                <strong className={S.STATS_NUM}>{counts.all}</strong>
                <span className={S.STATS_LABEL}>{t('knowledgeReports.stats.total')}</span>
              </div>
              <div className={S.STATS_ITEM}>
                <strong className={S.STATS_NUM}>{counts.reviewing}</strong>
                <span className={S.STATS_LABEL}>{t('knowledgeReports.stats.reviewing')}</span>
              </div>
              <div className={S.STATS_ITEM}>
                <strong className={S.STATS_NUM}>{counts.resolved}</strong>
                <span className={S.STATS_LABEL}>{t('knowledgeReports.stats.updated')}</span>
              </div>
            </div>

            <button className={S.PRIMARY_BTN} type="button" onClick={handleAskInLine}>
              {t('knowledgeReports.askInLine')}
            </button>
          </div>
        </div>

        {latestReport && (
          <div className={S.HERO_CARD}>
            <article className={S.FEATURED} aria-label={t('knowledgeReports.latest')}>
              <div className={S.GLOW_ONE} />
              <div className={S.GLOW_TWO} />
              <div className={S.MEDICAL_MARK} aria-hidden="true">
                <span className={S.MEDICAL_MARK_PLUS}>+</span>
              </div>
              <div className={S.FEATURED_CONTENT}>
                <span className={S.FEATURED_EYEBROW}>{t('knowledgeReports.latest')}</span>
                <h2 className={S.FEATURED_H2}>{latestReport.question}</h2>
                <span className={cn(S.STATUS_BADGE, S.STATUS_BADGE_TONE[latestReport.status])}>
                  {statusMeta[latestReport.status].icon}
                  {statusMeta[latestReport.status].label}
                </span>
                <time className={S.FEATURED_TIME}>
                  {t('knowledgeReports.submittedAtValue', { date: latestReport.submittedAt })}
                </time>
              </div>
            </article>
          </div>
        )}
      </section>

      <section className={S.LIST_SECTION} aria-labelledby="knowledge-list-title">
        <div className={S.LIST_HEADER}>
          <div className={S.TABS} role="group" aria-label={t('knowledgeReports.filterLabel')}>
            {filters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={cn(S.TAB_BTN, activeFilter === filter.value && S.TAB_ACTIVE)}
                aria-pressed={activeFilter === filter.value}
                onClick={() => setActiveFilter(filter.value)}
              >
                {filter.label}
                <span>{counts[filter.value]}</span>
              </button>
            ))}
          </div>
          <select className={S.SORT_SELECT} aria-label={t('knowledgeReports.sortLabel')} defaultValue="newest">
            <option value="newest">{t('knowledgeReports.sort.newest')}</option>
            <option value="oldest">{t('knowledgeReports.sort.oldest')}</option>
          </select>
        </div>

        <h2 id="knowledge-list-title" className="sr-only">{t('knowledgeReports.listTitle')}</h2>

        {loading ? (
          <div className={S.EMPTY}>
            <p className={S.EMPTY_P}>{t('knowledgeReports.loading')}</p>
          </div>
        ) : error ? (
          <div className={S.EMPTY}>
            <span className={S.EMPTY_ICON} aria-hidden="true">!</span>
            <h3 className={S.EMPTY_H3}>{t('knowledgeReports.loadError')}</h3>
            <p className={S.EMPTY_P}>{error}</p>
          </div>
        ) : reports.length === 0 ? (
          <div className={S.EMPTY}>
            <span className={S.EMPTY_ICON} aria-hidden="true">✓</span>
            <h3 className={S.EMPTY_H3}>{t('knowledgeReports.emptyAllTitle')}</h3>
            <p className={S.EMPTY_P}>{t('knowledgeReports.emptyAllDesc')}</p>
          </div>
        ) : (
          <>
            <div className={S.REPORT_LIST}>
              {visibleReports.map((report) => (
                <button
                  key={report.id}
                  type="button"
                  className={S.REPORT_CARD}
                  onClick={() => setSelectedReport(report)}
                  aria-label={t('knowledgeReports.viewReport', { question: report.question })}
                >
                  <span className={cn(S.REPORT_ICON, S.STATUS_TONE_SOFT[report.status])} aria-hidden="true">
                    {report.status === 'resolved' ? '✓' : report.status === 'rejected' ? '×' : '!'}
                  </span>

                  <span className={S.REPORT_QUESTION}>
                    <strong className={S.REPORT_QUESTION_STRONG}>{report.question}</strong>
                    <span className={S.REPORT_META}>
                      <span className={cn(S.REASON_TAG, S.STATUS_TONE_SOFT[report.status])}>{report.reason}</span>
                      <time className={S.META_MUTED}>
                        {t('knowledgeReports.submittedAtValue', { date: report.submittedAt })}
                      </time>
                    </span>
                  </span>

                  <span className={S.REPORT_REVIEW}>
                    <small className={S.META_MUTED}>{t('knowledgeReports.reviewUpdate')}</small>
                    <span className={S.REPORT_REVIEW_TEXT}>{report.reviewerNote}</span>
                  </span>

                  <span className={cn(S.STATUS_BADGE, S.STATUS_BADGE_TONE[report.status], S.CARD_STATUS_POS)}>
                    {statusMeta[report.status].icon}
                    {statusMeta[report.status].label}
                  </span>
                  <span className={S.CHEVRON} aria-hidden="true">›</span>
                </button>
              ))}
            </div>

            {visibleReports.length === 0 && (
              <div className={S.EMPTY}>
                <span className={S.EMPTY_ICON} aria-hidden="true">✓</span>
                <h3 className={S.EMPTY_H3}>{t('knowledgeReports.emptyTitle')}</h3>
                <p className={S.EMPTY_P}>{t('knowledgeReports.emptyDesc')}</p>
              </div>
            )}
          </>
        )}
      </section>

      {selectedReport && (
        <div
          className={S.DIALOG_BACKDROP}
          role="presentation"
          onMouseDown={() => setSelectedReport(null)}
        >
          <section
            className={S.DIALOG}
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className={S.DIALOG_CLOSE}
              type="button"
              aria-label={t('knowledgeReports.closeDetail')}
              onClick={() => setSelectedReport(null)}
            >
              ×
            </button>
            <span className={cn(S.STATUS_BADGE, S.STATUS_BADGE_TONE[selectedReport.status])}>
              {statusMeta[selectedReport.status].icon}
              {statusMeta[selectedReport.status].label}
            </span>
            <p className={S.DIALOG_ID}>{selectedReport.id}</p>
            <h2 id="report-dialog-title" className={S.DIALOG_H2}>{selectedReport.question}</h2>
            <dl className={S.DIALOG_DL}>
              <div className={S.DIALOG_ITEM}>
                <dt className={S.DIALOG_DT}>{t('knowledgeReports.detail.type')}</dt>
                <dd className={S.DIALOG_DD}>{selectedReport.reason}</dd>
              </div>
              <div className={S.DIALOG_ITEM}>
                <dt className={S.DIALOG_DT}>{t('knowledgeReports.detail.submittedAt')}</dt>
                <dd className={S.DIALOG_DD}>{selectedReport.submittedAt}</dd>
              </div>
              <div className={S.DIALOG_ITEM}>
                <dt className={S.DIALOG_DT}>{t('knowledgeReports.detail.progress')}</dt>
                <dd className={S.DIALOG_DD}>{selectedReport.reviewerNote}</dd>
              </div>
              {selectedReport.resolution && (
                <div className={S.DIALOG_ITEM}>
                  <dt className={S.DIALOG_DT}>{t('knowledgeReports.detail.result')}</dt>
                  <dd className={S.DIALOG_DD}>{selectedReport.resolution}</dd>
                </div>
              )}
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}

export default KnowledgeReportsPage;

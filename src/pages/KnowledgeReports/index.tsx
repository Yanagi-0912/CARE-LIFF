import { useMemo, useState } from 'react';
import liff from '@line/liff';
import { useTranslation } from 'react-i18next';
import DecryptedText from '../../components/DecryptedText/DecryptedText';
import './index.css';

type ReportStatus = 'pending' | 'reviewing' | 'resolved';
type ReportFilter = 'all' | ReportStatus;

interface KnowledgeReport {
  id: string;
  question: string;
  reason: string;
  status: ReportStatus;
  submittedAt: string;
  reviewerNote: string;
  resolution?: string;
}

interface KnowledgeReportDefinition {
  id: string;
  questionKey: string;
  reasonKey: string;
  status: ReportStatus;
  submittedAt: string;
  reviewerNoteKey: string;
  resolutionKey?: string;
}

const reportDefinitions: KnowledgeReportDefinition[] = [
  {
    id: 'KR-2025-003',
    questionKey: 'knowledgeReports.sample.question1',
    reasonKey: 'knowledgeReports.reason.outdated',
    status: 'pending',
    submittedAt: '2025/05/10',
    reviewerNoteKey: 'knowledgeReports.sample.note1',
  },
  {
    id: 'KR-2025-002',
    questionKey: 'knowledgeReports.sample.question2',
    reasonKey: 'knowledgeReports.reason.missing',
    status: 'reviewing',
    submittedAt: '2025/05/08',
    reviewerNoteKey: 'knowledgeReports.sample.note2',
  },
  {
    id: 'KR-2025-001',
    questionKey: 'knowledgeReports.sample.question3',
    reasonKey: 'knowledgeReports.reason.outdated',
    status: 'resolved',
    submittedAt: '2025/05/01',
    reviewerNoteKey: 'knowledgeReports.sample.note3',
    resolutionKey: 'knowledgeReports.sample.resolution3',
  },
];

function KnowledgeReportsPage() {
  const { t } = useTranslation();
  const [activeFilter, setActiveFilter] = useState<ReportFilter>('all');
  const [selectedReport, setSelectedReport] = useState<KnowledgeReport | null>(null);

  const reports = useMemo<KnowledgeReport[]>(
    () => reportDefinitions.map((report) => ({
      id: report.id,
      question: t(report.questionKey),
      reason: t(report.reasonKey),
      status: report.status,
      submittedAt: report.submittedAt,
      reviewerNote: t(report.reviewerNoteKey),
      resolution: report.resolutionKey ? t(report.resolutionKey) : undefined,
    })),
    [t],
  );

  const statusMeta: Record<ReportStatus, { label: string; icon: string }> = {
    pending: { label: t('knowledgeReports.status.pending'), icon: '○' },
    reviewing: { label: t('knowledgeReports.status.reviewing'), icon: '◌' },
    resolved: { label: t('knowledgeReports.status.resolved'), icon: '✓' },
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
    <div className="knowledgeReportsPage">
      <div className="knowledgeNoticeCard">
        <section className="knowledgeNotice" aria-label={t('knowledgeReports.noticeLabel')}>
          <span className="knowledgeNoticeIcon" aria-hidden="true">?</span>
          <p>{t('knowledgeReports.notice')}</p>
          <button type="button" onClick={handleAskInLine}>
            {t('knowledgeReports.backToLine')}
            <span aria-hidden="true">›</span>
          </button>
        </section>
      </div>

      <section className="knowledgeHero">
        <div className="knowledgeSummaryCard">
          <div className="knowledgeSummary">
            <div className="knowledgeAvatar" aria-hidden="true">{t('knowledgeReports.avatar')}</div>
            <div className="knowledgeSummaryCopy">
              <span className="knowledgeEyebrow">{t('knowledgeReports.eyebrow')}</span>
              <h1>
                <DecryptedText
                  text={t('knowledgeReports.title')}
                  speed={34}
                  sequential
                  revealDirection="center"
                  useOriginalCharsOnly
                  animateOn="view"
                  className="decrypted-text__revealed"
                  encryptedClassName="decrypted-text__encrypted"
                />
              </h1>
            </div>

            <div className="knowledgeStats" aria-label={t('knowledgeReports.statsLabel')}>
              <div>
                <strong>{counts.all}</strong>
                <span>{t('knowledgeReports.stats.total')}</span>
              </div>
              <div>
                <strong>{counts.reviewing}</strong>
                <span>{t('knowledgeReports.stats.reviewing')}</span>
              </div>
              <div>
                <strong>{counts.resolved}</strong>
                <span>{t('knowledgeReports.stats.updated')}</span>
              </div>
            </div>

            <button className="knowledgePrimaryButton" type="button" onClick={handleAskInLine}>
              {t('knowledgeReports.askInLine')}
            </button>
          </div>
        </div>

        <div className="knowledgeFeaturedCard">
          <article className="knowledgeFeatured" aria-label={t('knowledgeReports.latest')}>
            <div className="featuredGlow featuredGlowOne" />
            <div className="featuredGlow featuredGlowTwo" />
            <div className="featuredMedicalMark" aria-hidden="true">
              <span>+</span>
            </div>
            <div className="featuredContent">
              <span className="knowledgeEyebrow">{t('knowledgeReports.latest')}</span>
              <h2>{latestReport.question}</h2>
              <span className={`knowledgeStatus status-${latestReport.status}`}>
                {statusMeta[latestReport.status].icon}
                {statusMeta[latestReport.status].label}
              </span>
              <time>{t('knowledgeReports.submittedAtValue', { date: latestReport.submittedAt })}</time>
            </div>
          </article>
        </div>
      </section>

      <section className="knowledgeListSection" aria-labelledby="knowledge-list-title">
        <div className="knowledgeListHeader">
          <div className="knowledgeTabs" role="group" aria-label={t('knowledgeReports.filterLabel')}>
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
          <select className="knowledgeSort" aria-label={t('knowledgeReports.sortLabel')} defaultValue="newest">
            <option value="newest">{t('knowledgeReports.sort.newest')}</option>
            <option value="oldest">{t('knowledgeReports.sort.oldest')}</option>
          </select>
        </div>

        <h2 id="knowledge-list-title" className="visuallyHidden">{t('knowledgeReports.listTitle')}</h2>

        <div className="knowledgeReportList">
          {visibleReports.map((report) => (
            <button
              key={report.id}
              type="button"
              className={`knowledgeReportCard report-${report.status}`}
              onClick={() => setSelectedReport(report)}
              aria-label={t('knowledgeReports.viewReport', { question: report.question })}
            >
              <span className="reportIcon" aria-hidden="true">
                {report.status === 'resolved' ? '✓' : '!'}
              </span>

              <span className="reportQuestion">
                <strong>{report.question}</strong>
                <span className="reportMeta">
                  <span className={`reasonTag reason-${report.status}`}>{report.reason}</span>
                  <time>{t('knowledgeReports.submittedAtValue', { date: report.submittedAt })}</time>
                </span>
              </span>

              <span className="reportReview">
                <small>{t('knowledgeReports.reviewUpdate')}</small>
                <span>{report.reviewerNote}</span>
              </span>

              <span className={`knowledgeStatus status-${report.status}`}>
                {statusMeta[report.status].icon}
                {statusMeta[report.status].label}
              </span>
              <span className="reportChevron" aria-hidden="true">›</span>
            </button>
          ))}
        </div>

        {visibleReports.length === 0 && (
          <div className="knowledgeEmpty">
            <span aria-hidden="true">✓</span>
            <h3>{t('knowledgeReports.emptyTitle')}</h3>
            <p>{t('knowledgeReports.emptyDesc')}</p>
          </div>
        )}
      </section>

      {selectedReport && (
        <div
          className="reportDialogBackdrop"
          role="presentation"
          onMouseDown={() => setSelectedReport(null)}
        >
          <section
            className="reportDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="reportDialogClose"
              type="button"
              aria-label={t('knowledgeReports.closeDetail')}
              onClick={() => setSelectedReport(null)}
            >
              ×
            </button>
            <span className={`knowledgeStatus status-${selectedReport.status}`}>
              {statusMeta[selectedReport.status].icon}
              {statusMeta[selectedReport.status].label}
            </span>
            <p className="reportDialogId">{selectedReport.id}</p>
            <h2 id="report-dialog-title">{selectedReport.question}</h2>
            <dl>
              <div>
                <dt>{t('knowledgeReports.detail.type')}</dt>
                <dd>{selectedReport.reason}</dd>
              </div>
              <div>
                <dt>{t('knowledgeReports.detail.submittedAt')}</dt>
                <dd>{selectedReport.submittedAt}</dd>
              </div>
              <div>
                <dt>{t('knowledgeReports.detail.progress')}</dt>
                <dd>{selectedReport.reviewerNote}</dd>
              </div>
              {selectedReport.resolution && (
                <div>
                  <dt>{t('knowledgeReports.detail.result')}</dt>
                  <dd>{selectedReport.resolution}</dd>
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

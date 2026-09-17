import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { getClinicVisit, type ClinicVisitRecord } from '../../api/clinicVisitApi';

/**
 * 一次看診的摘要與原文。
 *
 * 版面順序是刻意的：**警語在摘要之前**。摘要讀起來很像醫囑，但系統分不出哪一句是
 * 醫師說的（語者分離只用來換段，見 `app/services/speech/clinic_transcribe.py`），
 * 所以要先讓人知道這件事，再讓他讀內容。
 *
 * 原文永遠展開得出來，而且段落之間只用留白區隔、不給「講者 1」這種編號——
 * 三人以上的講者歸屬是實驗性質，標了編號而分錯，讀的人會被編號誤導；
 * 只做段落分隔的話，同一種錯誤最多是多一個換行。
 */

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="text-base font-semibold">{title}</h2>
      <ul className="mt-2 space-y-1.5">
        {items.map((item, index) => (
          <li key={index} className="leading-relaxed">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 從推播進來的人沒有上一頁可退，所以回清單要自己給一顆，而且要記得是誰的清單。 */
function BackToList({ targetUserId }: { targetUserId?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const query = targetUserId ? `?target_user_id=${encodeURIComponent(targetUserId)}` : '';
  return (
    <Button
      variant="ghost"
      className="-ml-3 mb-2 h-auto min-h-11 whitespace-normal"
      onClick={() => navigate(`/clinic-visits${query}`)}
    >
      <ArrowLeftIcon data-icon="inline-start" />
      {t('clinic.backToList')}
    </Button>
  );
}

export default function ClinicVisitDetailPage() {
  const { t } = useTranslation();
  const { recordId } = useParams<{ recordId: string }>();
  const [params] = useSearchParams();
  const targetUserId = params.get('target_user_id') ?? undefined;

  const [record, setRecord] = useState<ClinicVisitRecord | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!recordId) return;
    let alive = true;
    const load = async () => {
      try {
        const next = await getClinicVisit(recordId, targetUserId);
        if (!alive) return;
        setRecord(next);
        // 還在轉錄就過一會再看。轉錄是背景工作，沒有其他辦法知道它好了沒。
        if (next.status === 'processing') window.setTimeout(load, 5000);
      } catch {
        if (alive) setFailed(true);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [recordId, targetUserId]);

  if (failed) {
    return (
      <main className="px-4 py-6">
        <BackToList targetUserId={targetUserId} />
        <p>{t('clinic.status.failed')}</p>
      </main>
    );
  }
  if (!record) return <main className="px-4 py-10">{t('clinic.status.processing')}</main>;

  if (record.status === 'processing') {
    return (
      <main className="mx-auto max-w-md px-4 py-6">
        <BackToList targetUserId={targetUserId} />
        <p className="mt-4 text-center text-lg">{t('clinic.status.processing')}</p>
      </main>
    );
  }

  if (record.status === 'failed') {
    return (
      <main className="mx-auto max-w-md px-4 py-6">
        <BackToList targetUserId={targetUserId} />
        <h1 className="text-xl font-semibold">{t('clinic.status.failed')}</h1>
        <p className="mt-3 leading-relaxed">{record.failure_reason}</p>
      </main>
    );
  }

  const { summary } = record;

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <BackToList targetUserId={targetUserId} />
      <h1 className="text-xl font-semibold">
        {record.hospital_name || t('clinic.title')}
        {record.department && ` · ${record.department}`}
      </h1>

      {record.consent === 'self_recap' && (
        <p className="mt-3 rounded-lg bg-muted p-3 text-sm">{t('clinic.selfRecapNotice')}</p>
      )}
      {/* 警語在摘要之前，不在之後：摘要讀起來很像醫囑。 */}
      <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
        {t('clinic.summary.notice')}
      </p>
      {summary.truncated && (
        <p className="mt-2 text-sm text-muted-foreground">{t('clinic.summary.truncated')}</p>
      )}

      <Section title={t('clinic.summary.main')} items={summary.main_points} />

      {summary.medication_changes.length > 0 && (
        <section className="mt-6">
          <h2 className="text-base font-semibold">{t('clinic.summary.medication')}</h2>
          <ul className="mt-2 space-y-3">
            {summary.medication_changes.map((change, index) => (
              <li key={index} className="rounded-lg border p-3">
                <p className="leading-relaxed">{change.description}</p>
                {/* 原文是這一欄唯一的防線：讓摘要可以被當場否證。 */}
                <p className="mt-2 border-l-2 pl-3 text-sm text-muted-foreground">
                  {change.quote}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.next_visit && (
        <Section title={t('clinic.summary.nextVisit')} items={[summary.next_visit]} />
      )}
      <Section title={t('clinic.summary.reminders')} items={summary.reminders} />
      <Section title={t('clinic.summary.unclear')} items={summary.unclear} />

      {record.drug_hints.length > 0 && (
        <section className="mt-6">
          <h2 className="text-base font-semibold">{t('clinic.summary.medication')}</h2>
          <ul className="mt-2 space-y-2">
            {record.drug_hints.map((hint, index) => (
              <li key={index} className="rounded-lg bg-muted p-3 text-sm">
                {/* 兩邊並排，不宣稱哪一個才對。 */}
                <div>
                  {t('clinic.hint.heard')}：{hint.heard}
                </div>
                <div className="mt-1">
                  {t('clinic.hint.yourMedication')}：{hint.medication_name}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-base font-semibold">{t('clinic.transcript.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('clinic.transcript.notice')}</p>
        <div className="mt-3 space-y-4">
          {record.segments.map((segment, index) => (
            // 只用留白區隔，不給講者編號——標錯編號比不標更糟。
            <p key={index} className="leading-relaxed">
              {segment.text}
            </p>
          ))}
        </div>
      </section>
    </main>
  );
}

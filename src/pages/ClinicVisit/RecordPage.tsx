import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Mic, Square, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  uploadClinicRecording,
  type ClinicVisitRecord,
  type ConsentMode,
} from '../../api/clinicVisitApi';
import { useClinicRecorder } from '../../hooks/useClinicRecorder';

/**
 * 看診錄音頁。
 *
 * 畫面的順序就是產品規則：**第一屏是徵詢同意，不是設定**。衛福部《醫療機構醫療隱私
 * 維護規範》第二點要求診療過程錄音須先徵得對方同意，所以要先給使用者一句可以拿給
 * 醫師看的話，選過才進得了錄音。
 *
 * 醫師不同意時走「出來後自己講」那條路。這條路很重要——它讓功能在被拒絕時還活著，
 * 而且走的是同一套轉錄與摘要，只是畫面要標明那是長輩記得的版本，不是醫師的原話。
 */

type Phase = 'consent' | 'record' | 'sent';

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function ClinicRecordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const recorder = useClinicRecorder();

  const [phase, setPhase] = useState<Phase>('consent');
  const [consent, setConsent] = useState<ConsentMode>('doctor_agreed');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<ClinicVisitRecord | null>(null);
  const navigate = useNavigate();

  // 從掛號提醒的推播進來時會帶這些，讓紀錄知道是哪一次門診。
  const targetUserId = params.get('target_user_id') ?? undefined;
  const appointmentId = params.get('appointment_id') ?? undefined;
  const hospitalName = params.get('hospital_name') ?? undefined;
  const department = params.get('department') ?? undefined;

  const choose = async (mode: ConsentMode) => {
    setConsent(mode);
    setPhase('record');
    // 醫師同意的情況要馬上開始錄，診間時間很短；自己複述那條路讓使用者自己按，
    // 因為他還要走出診間。
    if (mode === 'doctor_agreed') await recorder.start();
  };

  const send = async () => {
    if (!recorder.blob) return;
    setUploading(true);
    setError(null);
    try {
      const record = await uploadClinicRecording({
        blob: recorder.blob,
        consent,
        targetUserId,
        appointmentId,
        hospitalName,
        department,
      });
      setSent(record);
      setPhase('sent');
    } catch {
      // 錄音還在記憶體裡，不要清掉——醫院訊號差，重試很常見。
      setError(t('clinic.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  if (recorder.unsupported) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-xl font-semibold">{t('clinic.title')}</h1>
        <p className="mt-4 rounded-lg bg-muted p-4 text-base leading-relaxed">
          {t(`clinic.unsupported.${recorder.unsupported}`)}
        </p>
      </main>
    );
  }

  if (phase === 'sent') {
    // 家人替長輩錄的，紀錄屬於長輩：連結要帶 target_user_id，API 才知道看的是誰的。
    const targetQuery = targetUserId ? `?target_user_id=${encodeURIComponent(targetUserId)}` : '';
    const sentId = sent?.id ?? sent?._id;
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-green-600" aria-hidden />
        <p className="mt-4 text-lg leading-relaxed">{t('clinic.done')}</p>
        <div className="mt-8 space-y-3">
          {sentId && (
            <Button
              className="h-14 w-full text-lg"
              onClick={() => navigate(`/clinic-visits/${encodeURIComponent(sentId)}${targetQuery}`)}
            >
              {t('clinic.viewRecord')}
            </Button>
          )}
          <Button
            variant="outline"
            className="h-12 w-full"
            onClick={() => navigate(`/clinic-visits${targetQuery}`)}
          >
            {t('clinic.backToList')}
          </Button>
        </div>
      </main>
    );
  }

  if (phase === 'consent') {
    return (
      <main className="mx-auto max-w-md px-4 py-8">
        <h1 className="text-xl font-semibold">{t('clinic.title')}</h1>
        <p className="mt-1 text-muted-foreground">{t('clinic.intro')}</p>

        <h2 className="mt-8 text-lg font-semibold">{t('clinic.consent.heading')}</h2>
        {/* 這句是要拿給醫師看的，所以字放大、獨立一塊，方便把手機轉過去。 */}
        <blockquote className="mt-3 rounded-xl border bg-card p-5 text-xl leading-relaxed">
          {t('clinic.consent.ask')}
        </blockquote>
        <p className="mt-3 text-sm text-muted-foreground">{t('clinic.consent.law')}</p>

        <div className="mt-8 space-y-3">
          <Button className="h-14 w-full text-lg" onClick={() => choose('doctor_agreed')}>
            <Mic className="mr-2 h-5 w-5" aria-hidden />
            {t('clinic.consent.agreed')}
          </Button>
          <Button
            variant="outline"
            className="h-14 w-full text-base"
            onClick={() => choose('self_recap')}
          >
            {t('clinic.consent.self')}
          </Button>
          <p className="text-sm text-muted-foreground">{t('clinic.consent.selfHint')}</p>
        </div>
      </main>
    );
  }

  const atLimit = recorder.state === 'stopped' && recorder.seconds * 1000 >= 30 * 60 * 1000;

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-xl font-semibold">{t('clinic.title')}</h1>
      {consent === 'self_recap' && (
        <p className="mt-2 rounded-lg bg-muted p-3 text-sm">{t('clinic.selfRecapNotice')}</p>
      )}

      <div className="mt-10 text-center">
        <div
          className="text-5xl font-semibold tabular-nums"
          role="timer"
          aria-live="off"
        >
          {formatDuration(recorder.seconds)}
        </div>
        {recorder.state === 'recording' && (
          // 錄音中一定要一直看得見，這是徵詢同意之外的第二個誠實要求。
          <p className="mt-3 flex items-center justify-center gap-2 text-base text-red-600">
            <span className="h-3 w-3 animate-pulse rounded-full bg-red-600" aria-hidden />
            {t('clinic.recordingNotice')}
          </p>
        )}
      </div>

      {atLimit && <p className="mt-4 text-center text-sm">{t('clinic.maxLength')}</p>}
      {error && <p className="mt-4 text-center text-base text-destructive">{error}</p>}

      <div className="mt-10 space-y-3">
        {recorder.state === 'idle' && (
          <Button className="h-16 w-full text-lg" onClick={recorder.start}>
            <Mic className="mr-2 h-6 w-6" aria-hidden />
            {t('clinic.recording')}
          </Button>
        )}
        {recorder.state === 'recording' && (
          <Button variant="destructive" className="h-16 w-full text-lg" onClick={recorder.stop}>
            <Square className="mr-2 h-5 w-5" aria-hidden />
            {t('clinic.stop')}
          </Button>
        )}
        {recorder.state === 'stopped' && (
          <>
            <Button className="h-16 w-full text-lg" onClick={send} disabled={uploading}>
              <Upload className="mr-2 h-5 w-5" aria-hidden />
              {uploading ? t('clinic.uploading') : t('clinic.upload')}
            </Button>
            <Button
              variant="outline"
              className="h-12 w-full"
              onClick={recorder.reset}
              disabled={uploading}
            >
              {t('clinic.retake')}
            </Button>
          </>
        )}
      </div>
    </main>
  );
}

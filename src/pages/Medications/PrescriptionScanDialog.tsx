import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CameraIcon, TriangleAlertIcon } from 'lucide-react';
import { PrescriptionScanError, scanPrescription } from '../../api/medicationApi';
import type { PrescriptionDraft, PrescriptionScanFailureReason } from '../../types/prescription';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { PrescriptionImageCrop } from './PrescriptionImageCrop';
import type { ImageCrop } from '@/utils/prescriptionImage';

interface PrescriptionScanDialogProps {
  /** 辨識成功，交給頁面開啟核對畫面（本 dialog 本身不負責顯示草稿） */
  onScanned: (draft: PrescriptionDraft) => void;
  /** 使用者放棄辨識、改用原本手動建立提醒的路徑 */
  onManualFallback: () => void;
  onClose: () => void;
}

const FULL_IMAGE: ImageCrop = { x: 0, y: 0, width: 1, height: 1 };

type Status = 'idle' | 'preview' | 'preparing' | 'uploading' | 'error';

/**
 * 三種辨識失敗原因（unreadable／not_prescription／service_unavailable）加上
 * 前端依 413／415 另外賦予的 too_large／unsupported_type，各自需要不同的
 * 下一步指示——合併成同一則訊息會讓使用者重拍好幾次仍然無效。
 */
const FAILURE_COPY_KEY: Record<
  PrescriptionScanFailureReason,
  { title: string; desc: string }
> = {
  unreadable: { title: 'meds.scan.error.unreadable.title', desc: 'meds.scan.error.unreadable.desc' },
  not_prescription: {
    title: 'meds.scan.error.notPrescription.title',
    desc: 'meds.scan.error.notPrescription.desc',
  },
  service_unavailable: {
    title: 'meds.scan.error.serviceUnavailable.title',
    desc: 'meds.scan.error.serviceUnavailable.desc',
  },
  too_large: { title: 'meds.scan.error.tooLarge.title', desc: 'meds.scan.error.tooLarge.desc' },
  unsupported_type: {
    title: 'meds.scan.error.unsupportedType.title',
    desc: 'meds.scan.error.unsupportedType.desc',
  },
};

export function PrescriptionScanDialog({
  onScanned,
  onManualFallback,
  onClose,
}: PrescriptionScanDialogProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [failureReason, setFailureReason] = useState<PrescriptionScanFailureReason | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [crop, setCrop] = useState<ImageCrop>(FULL_IMAGE);
  const [cropReady, setCropReady] = useState(false);
  const [preparationFailed, setPreparationFailed] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const busy = status === 'preparing' || status === 'uploading';

  const handleFile = async (file: File, original = false) => {
    const abort = new AbortController(); controller.current = abort;
    setStatus(original ? 'uploading' : 'preparing');
    setFailureReason(null);
    let prepared = original;
    try {
      const upload = original ? file : (await (await import('@/utils/prescriptionImage')).preparePrescriptionImage(file, {
        strategy: 'crop', crop, signal: abort.signal,
      })).file;
      if (abort.signal.aborted) return;
      prepared = true; setStatus('uploading');
      const draft = await scanPrescription(upload);
      if (abort.signal.aborted) return;
      onScanned(draft);
    } catch (err) {
      if (abort.signal.aborted) return;
      setStatus('error');
      setPreparationFailed(!prepared);
      setFailureReason(!prepared ? 'unreadable' : err instanceof PrescriptionScanError ? err.reason : 'service_unavailable');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 清空 value：同一個檔案重選一次也要能觸發 onChange，重拍失敗後才能重試
    e.target.value = '';
    if (file) {
      setSelectedFile(file); setCrop(FULL_IMAGE); setCropReady(false);
      setPreparationFailed(false); setFailureReason(null); setStatus('preview');
    }
  };

  const copyKey = failureReason ? FAILURE_COPY_KEY[failureReason] : null;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{t('meds.scan.title')}</DialogTitle>
          <DialogDescription>{t('meds.scan.desc')}</DialogDescription>
        </DialogHeader>

        {/* 隱藏的原生檔案輸入。
            這裡不能加 capture="environment"：那會讓手機直接叫出相機並完全跳過
            檔案選擇器，使用者選不到相簿裡的既有照片——與按鈕文案（六個語言都是
            「拍照或選擇照片」）互相矛盾。只給 accept="image/*" 時，iOS 會出現
            「照片圖庫／拍照／選擇檔案」、Android 會同時給相機與圖庫，才符合文案。
            這也是實際需要的：藥袋照片常常是先拍好的，或由家人傳過來。 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label={t('meds.scan.captureButton')}
          onChange={handleInputChange}
        />

        {status === 'preview' && selectedFile && <PrescriptionImageCrop file={selectedFile}
          onChange={setCrop} onReady={() => setCropReady(true)}
          onError={() => { setPreparationFailed(true); setStatus('error'); }} />}

        {busy && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Spinner className="size-8" />
            <p role="status" className="text-base font-medium">{t(status === 'preparing' ? 'meds.scan.preparing' : 'meds.scan.uploading')}</p>
          </div>
        )}

        {status === 'error' && preparationFailed && <Alert variant="destructive">
          <TriangleAlertIcon /><AlertTitle>{t('meds.scan.prepareError')}</AlertTitle>
          <AlertDescription>{t('meds.scan.prepareErrorHint')}</AlertDescription>
        </Alert>}
        {status === 'error' && !preparationFailed && copyKey && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>{t(copyKey.title)}</AlertTitle>
            <AlertDescription>{t(copyKey.desc)}</AlertDescription>
          </Alert>
        )}

        {status === 'preview' && selectedFile && <Button type="button" size="lg" disabled={!cropReady}
          onClick={() => void handleFile(selectedFile)}>{t('meds.scan.startScan')}</Button>}
        {status === 'error' && preparationFailed && selectedFile && <Button type="button" variant="outline"
          onClick={() => void handleFile(selectedFile, true)}>{t('meds.scan.sendOriginal')}</Button>}

        {!busy && (
          <Button
            type="button"
            size="lg"
            className="h-16 w-full rounded-2xl text-base"
            onClick={() => fileInputRef.current?.click()}
          >
            <CameraIcon data-icon="inline-start" className="size-5" />
            {status === 'error' || status === 'preview' ? t('meds.scan.retake') : t('meds.scan.captureButton')}
          </Button>
        )}

        {/* DialogFooter 在手機是 flex-col-reverse：DOM 先寫取消，畫面上「改為手動建立」才在上、
            「取消」在最下面，與其他 dialog 的順序一致；取消也用同一種外框膠囊，不用純文字。 */}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            {t('meds.cancel')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onManualFallback}
          >
            {t('meds.scan.manualFallback')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

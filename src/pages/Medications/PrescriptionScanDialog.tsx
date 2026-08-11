import { useRef, useState } from 'react';
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

interface PrescriptionScanDialogProps {
  /** 辨識成功，交給頁面開啟核對畫面（本 dialog 本身不負責顯示草稿） */
  onScanned: (draft: PrescriptionDraft) => void;
  /** 使用者放棄辨識、改用原本手動建立提醒的路徑 */
  onManualFallback: () => void;
  onClose: () => void;
}

type Status = 'idle' | 'uploading' | 'error';

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

  const handleFile = async (file: File) => {
    setStatus('uploading');
    setFailureReason(null);
    try {
      const draft = await scanPrescription(file);
      onScanned(draft);
    } catch (err) {
      setStatus('error');
      setFailureReason(err instanceof PrescriptionScanError ? err.reason : 'service_unavailable');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 清空 value：同一個檔案重選一次也要能觸發 onChange，重拍失敗後才能重試
    e.target.value = '';
    if (file) void handleFile(file);
  };

  const copyKey = failureReason ? FAILURE_COPY_KEY[failureReason] : null;

  return (
    <Dialog open onOpenChange={(open) => !open && status !== 'uploading' && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
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

        {status === 'uploading' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Spinner className="size-8" />
            <p className="text-base font-medium">{t('meds.scan.uploading')}</p>
          </div>
        )}

        {status === 'error' && copyKey && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>{t(copyKey.title)}</AlertTitle>
            <AlertDescription>{t(copyKey.desc)}</AlertDescription>
          </Alert>
        )}

        {status !== 'uploading' && (
          <Button
            type="button"
            size="lg"
            className="h-16 w-full rounded-2xl text-base"
            onClick={() => fileInputRef.current?.click()}
          >
            <CameraIcon data-icon="inline-start" className="size-5" />
            {status === 'error' ? t('meds.scan.retake') : t('meds.scan.captureButton')}
          </Button>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={status === 'uploading'}
            onClick={onManualFallback}
          >
            {t('meds.scan.manualFallback')}
          </Button>
          <Button type="button" variant="ghost" disabled={status === 'uploading'} onClick={onClose}>
            {t('meds.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { queryKeys } from '@/lib/queryClient';
import {
  createKnowledgeReport,
  KnowledgeReportRequestError,
  type KnowledgeReportReason,
} from '@/api/knowledgeReportsApi';

/** 表單在可捲動的本體裡、送出鈕在 DialogFooter，靠 form 屬性連回來 */
const FORM_ID = 'knowledge-report-form';

// 本頁其餘元件一律 inline Tailwind（見 components.tsx），這裡沿用同一種寫法，
// 只把重複超過一次的組合收成常數。
const formStyles = {
  // 寬度一定要帶 sm:：不帶會蓋掉 DialogContent 在手機上保留左右各 1rem 的
  // max-w-[calc(100%-2rem)]，而 ≥640px 時又輸給內建的 sm:max-w-md，520px 從沒生效過。
  dialogContent:
    'max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-[520px]',
  form: 'flex flex-col gap-4',
  field: 'flex flex-col gap-2',
  hint: 'text-sm text-muted-foreground',
  error: 'flex flex-col gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive',
  errorList: 'flex flex-col gap-1 pl-4 list-disc',
  errorUrl: 'break-all font-medium',
} as const;

const REASON_OPTIONS: KnowledgeReportReason[] = ['outdated', 'missing', 'other'];

/** 重用既有的 knowledgeReports.reason.* 文案當選項標籤，不新增 3×6 筆字串 */
const REASON_LABEL_KEYS: Record<KnowledgeReportReason, string> = {
  outdated: 'knowledgeReports.reason.outdated',
  missing: 'knowledgeReports.reason.missing',
  other: 'knowledgeReports.reason.other',
};

interface ReportFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReportFormDialog({ open, onOpenChange }: ReportFormDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState<KnowledgeReportReason>('outdated');
  const [error, setError] = useState<KnowledgeReportRequestError | null>(null);

  useEffect(() => {
    if (!open) return;
    setUrl('');
    setNote('');
    setReason('outdated');
    setError(null);
  }, [open]);

  const mutation = useMutation({
    mutationFn: createKnowledgeReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeReports });
      toast.success(t('knowledgeReports.form.submitSuccess'));
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      setError(
        err instanceof KnowledgeReportRequestError
          ? err
          : new KnowledgeReportRequestError('generic'),
      );
    },
  });

  const trimmedUrl = url.trim();
  const trimmedNote = note.trim();
  // 只做「明顯不是網址」的前端檢查。白名單一律交給後端判定——前端硬編一份
  // 副本必然與可設定的後端清單漂移，而漂移方向是「前端擋掉後端其實允許的
  // 網址」，使用者被拒、後端沒有紀錄、沒有人會發現（design.md 決策 7）。
  const canSubmit = trimmedUrl.length > 0 && trimmedNote.length > 0 && !mutation.isPending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    mutation.mutate({
      question: trimmedNote,
      reason,
      // question 與 user_note 都填說明欄：複製由前端做，後端不做隱式複製，
      // API 契約維持誠實（design.md 決策 2）
      user_note: trimmedNote,
      user_source_urls: [trimmedUrl],
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={formStyles.dialogContent}>
        <DialogHeader>
          <DialogTitle>{t('knowledgeReports.form.title')}</DialogTitle>
        </DialogHeader>

        {/* 與新增／編輯提醒 dialog 同一套：只讓表單本體捲動，標題、右上關閉鈕與
            底部按鈕固定。特大字級下表單比手機視窗高，沒限高時整個 dialog 置中後
            標題與關閉鈕會跑到視窗上方，捲也捲不到。 */}
        <ScrollArea>
        {/* noValidate：type="url" 的原生驗證會擋下沒打 https:// 的網址、跳出瀏覽器自己的
            英文氣泡，但後端本來就會補 scheme（見 startKnowledgeReportPreview 的正規化）。
            空值由 canSubmit 擋，格式交給後端判、由 FormError 用六語文案回報。 */}
        <form id={FORM_ID} className={formStyles.form} onSubmit={handleSubmit} noValidate>
          <div className={formStyles.field}>
            <Label htmlFor="knowledge-report-url">
              {t('knowledgeReports.form.urlLabel')}
            </Label>
            <Input
              id="knowledge-report-url"
              type="url"
              inputMode="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.hpa.gov.tw/…"
              required
            />
            {/* 常駐揭露規則而非清單：完整清單會隨 env 變動、對使用者也沒有
                意義；文案若說得比實際保守，是安全的漂移方向 */}
            <p className={formStyles.hint}>{t('knowledgeReports.form.urlHint')}</p>
          </div>

          <div className={formStyles.field}>
            <Label htmlFor="knowledge-report-note">
              {t('knowledgeReports.form.noteLabel')}
            </Label>
            <Textarea
              id="knowledge-report-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('knowledgeReports.form.notePlaceholder')}
              rows={3}
              maxLength={500}
              required
            />
          </div>

          <div className={formStyles.field}>
            <Label htmlFor="knowledge-report-reason">
              {t('knowledgeReports.form.reasonLabel')}
            </Label>
            <Select
              value={reason}
              onValueChange={(value) => setReason(value as KnowledgeReportReason)}
            >
              <SelectTrigger id="knowledge-report-reason">
                <SelectValue>{(value) => t(REASON_LABEL_KEYS[value as KnowledgeReportReason])}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(REASON_LABEL_KEYS[option])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error ? <FormError error={error} /> : null}
        </form>
        </ScrollArea>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            {t('knowledgeReports.form.cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} disabled={!canSubmit}>
            {t('knowledgeReports.form.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormError({ error }: { error: KnowledgeReportRequestError }) {
  const { t } = useTranslation();

  if (error.code === 'quota_exceeded') {
    return (
      <p className={formStyles.error} role="alert">
        {t('knowledgeReports.form.error.quotaExceeded', { limit: error.limit ?? 0 })}
      </p>
    );
  }

  if (error.code === 'url_not_allowed') {
    return (
      <div className={formStyles.error} role="alert">
        <p>{t('knowledgeReports.form.error.urlNotAllowed')}</p>
        {/* 逐一列出全部被拒的網址：使用者貼三個被拒兩個時，只講一個會讓他
            修完再送、再被拒一次 */}
        <ul className={formStyles.errorList}>
          {error.invalidUrls.map((item) => (
            <li key={item.url}>
              <span className={formStyles.errorUrl}>{item.url}</span>
              {' — '}
              {t(
                item.reason === 'malformed'
                  ? 'knowledgeReports.form.error.urlInvalid'
                  : 'knowledgeReports.form.error.urlDomainNotAllowed',
              )}
            </li>
          ))}
        </ul>
        <p>{t('knowledgeReports.form.error.urlRemedy')}</p>
      </div>
    );
  }

  return (
    <p className={formStyles.error} role="alert">
      {t('knowledgeReports.form.error.generic')}
    </p>
  );
}

export default ReportFormDialog;

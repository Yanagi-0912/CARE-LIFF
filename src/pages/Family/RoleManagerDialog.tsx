import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RoleManagerContent } from './RoleManagerContent';

export function RoleManagerDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  // 打開時先聚焦標題，避免自動聚焦底部取消鈕而把權限提示捲出畫面。
  const titleRef = useRef<HTMLHeadingElement>(null);
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent initialFocus={titleRef} className="max-h-[85dvh] overflow-y-auto sm:max-w-[35rem]">
        <DialogHeader>
          <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">
            {t('familyRole.manage.title')}
          </DialogTitle>
          <DialogDescription>{t('familyRole.manage.desc')}</DialogDescription>
        </DialogHeader>
        <RoleManagerContent />
        <DialogClose render={<Button type="button" variant="outline" className="mt-4 w-full" />}>
          {t('familyPermission.cancel')}
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

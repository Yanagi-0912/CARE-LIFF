import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { UserPlusIcon } from 'lucide-react';

import { createInvite } from '../../api/familyApi';
import { InviteDialog } from './InviteDialog';
import { Button } from '@/components/ui/button';

interface Props {
  liffReady: boolean;
  onSuccess: () => void;
  onError: (msg: string) => void;
}

/**
 * 邀請入口。實際的邀請建立與遞出方式都在 `InviteDialog` 裡。
 *
 * 分享路徑從「按下去直接開 shareTargetPicker」改成先開 dialog，是因為
 * shareTargetPicker 只列得出 LINE 好友與群組——當面要給非好友掃的 QR、
 * 以及貼到別處的連結，都沒有地方可放。
 *
 * 按鈕本身不再需要 liffReady 才能按：dialog 裡的 QR 與複製連結不依賴 LIFF，
 * 只有「分享到 LINE」那顆需要。
 *
 * 邀請在這裡、在點擊的當下建立，而不是等 dialog 掛載後用 effect 建立——
 * 原因見 InviteDialog 的 `invite` prop 說明。每次點開都是一組新的邀請碼，
 * 上一次關掉沒用掉的那組就讓它七天後自然過期。
 */
export function InviteButton({ liffReady, onSuccess, onError }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const invite = useMutation({ mutationFn: createInvite });

  const handleOpen = () => {
    invite.mutate();
    setOpen(true);
  };

  return (
    <>
      <Button
        type="button"
        id="family-invite-btn"
        className="shrink-0 rounded-full"
        onClick={handleOpen}
      >
        <UserPlusIcon data-icon="inline-start" />
        {t('family.inviteBtn')}
      </Button>

      {open && (
        <InviteDialog
          invite={invite}
          liffReady={liffReady}
          onShared={onSuccess}
          onError={onError}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

import { useState, useCallback } from 'react';
import liff from '@line/liff';
import { createInvite } from '../../api/familyApi';
import { useI18n } from '../../i18n';

interface Props {
  liffReady: boolean;
  onSuccess: () => void;
  onError: (msg: string) => void;
}

/**
 * 邀請按鈕 — 呼叫後端產生邀請連結，透過 shareTargetPicker 分享
 */
export function InviteButton({ liffReady, onSuccess, onError }: Props) {
  const { t } = useI18n();
  const [inviting, setInviting] = useState(false);

  const handleInvite = useCallback(async () => {
    setInviting(true);
    try {
      const { invite_token } = await createInvite();
      const inviteUrl = `${window.location.origin}/join?code=${invite_token}`;

      if (!liffReady || !liff.isApiAvailable('shareTargetPicker')) {
        // 退而求其次，如果是瀏覽器則複製到剪貼簿或使用 Web Share
        if (navigator.share) {
          await navigator.share({
            title: t('family.shareTitle'),
            text: t('family.shareDesc'),
            url: inviteUrl,
          });
          onSuccess();
          return;
        }
        // 若都不支援，可能需要一個備用的複製連結 UI (此處先拋錯)
        throw new Error('LINE_CLIENT_REQUIRED');
      }

      const result = await liff.shareTargetPicker([
        buildFlexMessage(t, inviteUrl),
      ]);

      if (result === null) return; // 使用者取消
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error && err.message === 'LINE_CLIENT_REQUIRED'
        ? t('family.inviteLineRequired')
        : t('family.inviteError');
      onError(msg);
    } finally {
      setInviting(false);
    }
  }, [liffReady, t, onSuccess, onError]);

  return (
    <button
      id="family-invite-btn"
      className="invite-btn"
      onClick={handleInvite}
      disabled={inviting || !liffReady}
    >
      {inviting ? '⏳' : '➕'} {t('family.inviteBtn')}
    </button>
  );
}

/** 構建 Flex Message */
function buildFlexMessage(t: (key: string) => string, inviteUrl: string) {
  return {
    type: 'flex' as const,
    altText: t('family.shareTitle'),
    contents: {
      type: 'bubble' as const,
      hero: {
        type: 'image' as const,
        url: 'https://developers.line.biz/assets/images/services/bot-designer-icon.png',
        size: 'full' as const,
        aspectRatio: '20:13',
        aspectMode: 'cover' as const,
      },
      body: {
        type: 'box' as const,
        layout: 'vertical' as const,
        contents: [
          { type: 'text' as const, text: t('family.shareTitle'), weight: 'bold' as const, size: 'lg' as const },
          { type: 'text' as const, text: t('family.shareDesc'), size: 'sm' as const, color: '#999999', margin: 'md' as const, wrap: true },
        ],
      },
      footer: {
        type: 'box' as const,
        layout: 'vertical' as const,
        spacing: 'sm' as const,
        contents: [
          {
            type: 'button' as const,
            style: 'primary' as const,
            color: '#06c755',
            action: { type: 'uri' as const, label: t('family.inviteBtn'), uri: inviteUrl },
          },
        ],
      },
    },
  };
}

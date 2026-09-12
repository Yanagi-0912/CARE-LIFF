import { useCallback, useState } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import liff from '@line/liff';
import { CopyIcon, ShareIcon, TriangleAlertIcon } from 'lucide-react';

import type { CreateInviteResponse } from '../../types/family';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

interface Props {
  /**
   * 建立邀請的 mutation，由 InviteButton 在點擊時觸發後傳進來。
   *
   * 不在這裡用 useEffect 開 mutation：React StrictMode（開發模式、e2e 的
   * dev server）會把 effect 執行兩次，中間模擬一次 unmount。TanStack Query 的
   * MutationObserver 在 unmount 時把自己從 mutation 移除，remount 後不會再掛
   * 回去——effect 裡 mutate() 出去的那筆 mutation 完成時沒有人在聽，畫面就
   * 永遠停在「正在建立邀請…」。先前用 ref 擋第二次 mutate() 正是踩到這個：
   * 第一次的結果收不到，第二次又被擋掉。從點擊事件觸發就沒有這個問題。
   */
  invite: UseMutationResult<CreateInviteResponse, Error, void>;
  liffReady: boolean;
  /** 邀請確實送進 LINE 分享時觸發。掃 QR 不會經過這裡——那條路沒有回呼。 */
  onShared: () => void;
  onError: (msg: string) => void;
  onClose: () => void;
}

/**
 * 發邀請。一次建立、三種遞出方式：當面掃 QR、分享到 LINE、複製連結。
 *
 * 三者共用同一組邀請碼是刻意的——分開建立會在使用者只用掉其中一條路時，
 * 留下一堆七天內都有效的孤兒邀請。也因為共用，這張邀請**只有第一個接受的人
 * 進得來**（後端 accept 之後即 410），所以畫面上要把這件事講明白，不能讓
 * 邀請人以為連結和 QR 是兩個名額。
 */
export function InviteDialog({ invite, liffReady, onShared, onError, onClose }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);

  const data = invite.data;
  // 後端沒設 LIFF_ID 時才會走到這個 fallback。站台網址在外部瀏覽器開得起來，
  // 只是要多跑一次 LINE OAuth。
  const inviteUrl =
    data && (data.invite_url ?? `${window.location.origin}/join?code=${data.invite_token}`);

  const handleCopy = useCallback(async () => {
    if (!inviteUrl) return;
    try {
      // LIFF webview 不保證有 clipboard API（非安全內容、或使用者拒絕權限）。
      // 失敗時退回請使用者長按上方的連結，而不是靜靜地什麼都沒發生。
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onError(t('family.inviteDialog.copyFailed'));
    }
  }, [inviteUrl, onError, t]);

  const handleShare = useCallback(async () => {
    if (!inviteUrl) return;
    setSharing(true);
    try {
      if (!liffReady || !liff.isApiAvailable('shareTargetPicker')) {
        // 不在 LINE 裡就沒有 shareTargetPicker。這裡不再拋錯——QR 與複製連結
        // 就在同一個畫面上，使用者不會沒有路可走。
        throw new Error('LINE_CLIENT_REQUIRED');
      }

      const result = await liff.shareTargetPicker([
        buildFlexMessage(t, inviteUrl, data?.qr_url ?? null),
      ]);
      // shareTargetPicker 回傳 null 代表使用者在選擇器裡按了取消，那不算送出。
      if (result === null) return;
      onShared();
    } catch (err) {
      onError(
        err instanceof Error && err.message === 'LINE_CLIENT_REQUIRED'
          ? t('family.inviteLineRequired')
          : t('family.inviteError'),
      );
    } finally {
      setSharing(false);
    }
  }, [inviteUrl, liffReady, data?.qr_url, onShared, onError, t]);

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{t('family.inviteDialog.title')}</DialogTitle>
          <DialogDescription>{t('family.inviteDialog.desc')}</DialogDescription>
        </DialogHeader>

        {/* 錯誤要先判斷：失敗時 data 也是 undefined，若先看 `!data` 會永遠停在
            「正在建立邀請…」，建立失敗的提示根本到不了畫面。 */}
        {invite.isError ? (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertDescription>{t('family.inviteDialog.createFailed')}</AlertDescription>
          </Alert>
        ) : invite.isPending || !data ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Spinner className="size-8" />
            <p className="text-sm text-muted-foreground">
              {t('family.inviteDialog.creating')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {data.qr_url ? (
              // 白底方框：QR 的靜空區已經畫在圖裡，但深色模式下把它擺在深色
              // 背景上，掃描器對「亮底暗點」的假設就不成立了。
              <div className="mx-auto rounded-2xl bg-white p-3">
                <img
                  src={data.qr_url}
                  alt={t('family.inviteDialog.title')}
                  width={240}
                  height={240}
                  className="block size-[240px]"
                />
              </div>
            ) : (
              <Alert>
                <TriangleAlertIcon />
                <AlertDescription>
                  {t('family.inviteDialog.qrUnavailable')}
                </AlertDescription>
              </Alert>
            )}

            <Alert>
              <AlertDescription>{t('family.inviteDialog.singleUse')}</AlertDescription>
            </Alert>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="family-invite-url"
                className="text-sm font-medium text-muted-foreground"
              >
                {t('family.inviteDialog.linkLabel')}
              </label>
              <Input
                id="family-invite-url"
                readOnly
                value={inviteUrl ?? ''}
                // 複製 API 不可用時，使用者至少能一鍵全選再長按複製。
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Button type="button" onClick={() => void handleShare()} disabled={sharing}>
                {sharing ? <Spinner /> : <ShareIcon data-icon="inline-start" />}
                {t('family.inviteDialog.shareLine')}
              </Button>
              <Button type="button" variant="outline" onClick={() => void handleCopy()}>
                <CopyIcon data-icon="inline-start" />
                {copied
                  ? t('family.inviteDialog.copied')
                  : t('family.inviteDialog.copyLink')}
              </Button>
            </div>
          </div>
        )}

        <DialogClose render={<Button type="button" variant="ghost" className="mt-2 w-full" />}>
          {t('family.inviteDialog.close')}
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 分享到 LINE 的邀請卡片。
 *
 * QR 放 body 的獨立 image component、不放 hero：hero 的比例是為橫幅設計的，
 * 正方形的 QR 塞進去會被裁掉邊角——而 QR 少一角就掃不出來。`aspectMode: 'fit'`
 * 同樣是為此，`cover` 會裁切。
 *
 * 圖片網址必須是公開可達的 HTTPS：Flex 的圖是 LINE 的伺服器去抓的，帶不了
 * 使用者憑證，也不吃 data URI。後端組不出對外網址時 `qrUrl` 會是 null，
 * 那就送一張沒有 QR 的卡片，而不是送一張破圖。
 */
function buildFlexMessage(t: (key: string) => string, inviteUrl: string, qrUrl: string | null) {
  const body = [
    {
      type: 'text' as const,
      text: t('family.shareTitle'),
      weight: 'bold' as const,
      size: 'lg' as const,
      wrap: true,
    },
    {
      type: 'text' as const,
      text: t('family.shareDesc'),
      size: 'sm' as const,
      color: '#999999',
      margin: 'md' as const,
      wrap: true,
    },
    ...(qrUrl
      ? [
          {
            type: 'image' as const,
            url: qrUrl,
            size: 'full' as const,
            aspectRatio: '1:1' as const,
            aspectMode: 'fit' as const,
            margin: 'lg' as const,
          },
        ]
      : []),
  ];

  return {
    type: 'flex' as const,
    altText: t('family.shareTitle'),
    contents: {
      type: 'bubble' as const,
      body: { type: 'box' as const, layout: 'vertical' as const, contents: body },
      footer: {
        type: 'box' as const,
        layout: 'vertical' as const,
        spacing: 'sm' as const,
        contents: [
          {
            type: 'button' as const,
            style: 'primary' as const,
            color: '#06c755',
            action: {
              type: 'uri' as const,
              label: t('family.inviteBtn'),
              uri: inviteUrl,
            },
          },
        ],
      },
    },
  };
}

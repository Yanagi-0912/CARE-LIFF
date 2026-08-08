import React, { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { verifyInvite, acceptInvite } from '../../api/familyApi';
import { isAuthenticated } from '../../utils/auth';
import { saveRedirectUrl } from '../../utils/redirect';
import type { VerifyInviteResponse } from '../../types/family';
import { cn } from '@/lib/utils';
import { queryKeys } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';

// 'loading' 已由 inviteQuery.isPending 涵蓋（原本是手動先設 loading 再設 verifying）
type PageState = 'verifying' | 'preview' | 'error' | 'already_member' | 'success';

/* ────────── 樣式（原 index.css 遷移） ────────── */
// 品牌綠漸層主按鈕：漸層與光暈是此頁的視覺主角，維持手刻樣式
// 而非硬套 shadcn Button 再整組覆寫
const BTN_PRIMARY =
  'cursor-pointer rounded-lg border-0 bg-[linear-gradient(135deg,var(--primary),var(--primary-2))] p-[15px] text-base font-bold text-white shadow-[0_8px_20px_-8px_rgba(14,147,132,0.6)] transition-[transform,box-shadow,opacity] duration-140 hover:-translate-y-[2px] hover:shadow-[0_12px_26px_-10px_rgba(14,147,132,0.7)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60';
const H1_CLASS = 'm-0 mb-4 text-[1.4rem] font-extrabold text-ink';
const RESULT_CLASS = 'flex flex-col items-center';
// 結果狀態圖示：語意色圓形 badge
const ICON_BADGE = 'mb-6 flex size-16 items-center justify-center rounded-full text-[30px] font-extrabold';

const JoinPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');

  // 接受邀請後的結果由使用者操作決定，其餘狀態皆可由查詢／變更推導
  const [outcome, setOutcome] = useState<'already_member' | 'success' | null>(null);
  const [acceptError, setAcceptError] = useState<string>('');

  // 未登入先導向登入頁（保留深連結）
  useEffect(() => {
    if (!isAuthenticated()) {
      saveRedirectUrl(window.location.href);
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  const inviteQuery = useQuery({
    queryKey: queryKeys.inviteVerification(code ?? ''),
    queryFn: () => verifyInvite(code as string),
    enabled: Boolean(code) && isAuthenticated(),
    // 邀請碼失效是確定性的結果，重試沒有意義且會拖慢錯誤畫面
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: () => acceptInvite(code as string),
    onSuccess: (res) => {
      if (res.status === 'already_member') {
        setOutcome('already_member');
      } else {
        setOutcome('success');
        // 成功後 1.5 秒跳轉
        setTimeout(() => navigate('/family'), 1500);
      }
    },
    onError: (err: unknown) => {
      setAcceptError(err instanceof Error ? err.message : '加入家族失敗');
    },
  });

  const inviteInfo: VerifyInviteResponse | null = inviteQuery.data ?? null;
  const isAccepting = acceptMutation.isPending;

  /** 驗證失敗的訊息對應（沿用原本對 410／失效的判斷） */
  const verifyErrorMessage = (() => {
    const err = inviteQuery.error;
    if (!err) return '';
    const message = err instanceof Error ? err.message : '';
    if (message.includes('410') || message.includes('失效')) return '連結已失效或過期';
    return message || '驗證邀請碼失敗';
  })();

  const error = acceptError || verifyErrorMessage || (!code ? '無效的邀請連結' : '');

  const state: PageState = outcome
    ? outcome
    : acceptError
      ? 'error'
      : !code
        ? 'error'
        : inviteQuery.isError
          ? 'error'
          : inviteQuery.isPending
            ? 'verifying'
            : 'preview';

  const handleAccept = () => {
    if (!code || isAccepting) return;
    setAcceptError('');
    acceptMutation.mutate();
  };

  const handleCancel = () => {
    navigate('/');
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="animate-rise w-full max-w-[400px] rounded-xl border border-hair bg-surface px-6 py-8 text-center shadow-modal">
        {state === 'verifying' ? (
          <div className="flex flex-col items-center gap-4 text-muted-foreground">
            {/* 旋轉圈：Tailwind 內建 animate-spin */}
            <div className="size-10 animate-spin rounded-full border-[3px] border-surface-3 border-t-primary"></div>
            <p>正在驗證邀請資訊...</p>
          </div>
        ) : state === 'preview' ? (
          <div>
            {/* 邀請人頭像：品牌綠漸層 */}
            <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--primary),var(--primary-2))] text-[32px] font-extrabold text-white shadow-[0_10px_24px_-8px_rgba(14,147,132,0.55)]">
              {inviteInfo?.inviter_display_name?.charAt(0) || '?'}
            </div>
            <h1 className={H1_CLASS}>家族邀請</h1>
            <p className="mb-8 text-base leading-[1.6] text-muted-foreground">
              <span className="font-bold text-ink underline decoration-primary underline-offset-4">
                {inviteInfo?.inviter_display_name}
              </span>
              {' '}邀請您加入他的家族族譜。
            </p>
            <div className="flex flex-col gap-3">
              <Button
                type="button"
                className={BTN_PRIMARY}
                onClick={handleAccept}
                disabled={isAccepting}
              >
                {isAccepting ? '加入中...' : '確認加入'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-[0.9rem] text-faint hover:text-muted-foreground"
                onClick={handleCancel}
              >
                取消
              </Button>
            </div>
          </div>
        ) : state === 'already_member' ? (
          <div className={RESULT_CLASS}>
            <div className={cn(ICON_BADGE, 'bg-[var(--primary-soft)] text-[var(--primary-strong)]')}>i</div>
            <h1 className={H1_CLASS}>已是成員</h1>
            <p>您已經在此家族成員名單中。</p>
            <Button type="button" className={BTN_PRIMARY} onClick={() => navigate('/family')}>
              前往家族頁面
            </Button>
          </div>
        ) : state === 'success' ? (
          <div className={RESULT_CLASS}>
            <div className={cn(ICON_BADGE, 'bg-success-soft text-success')}>✓</div>
            <h1 className={H1_CLASS}>加入成功！</h1>
            <p>正在為您導向家族頁面...</p>
          </div>
        ) : (
          <div className={RESULT_CLASS}>
            <div className={cn(ICON_BADGE, 'bg-destructive-soft text-destructive')}>×</div>
            <h1 className={H1_CLASS}>連結無效</h1>
            <p>{error}</p>
            <Button type="button" className={BTN_PRIMARY} onClick={() => navigate('/')}>
              回首頁
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default JoinPage;

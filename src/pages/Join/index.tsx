import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { verifyInvite, acceptInvite } from '../../api/familyApi';
import { isAuthenticated } from '../../utils/auth';
import { saveRedirectUrl } from '../../utils/redirect';
import type { VerifyInviteResponse } from '../../types/family';
import { cn } from '@/lib/utils';

type PageState = 'loading' | 'verifying' | 'preview' | 'error' | 'already_member' | 'success';

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

  const [state, setState] = useState<PageState>('loading');
  const [inviteInfo, setInviteInfo] = useState<VerifyInviteResponse | null>(null);
  const [error, setError] = useState<string>('');
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    // 1. 檢查是否登入
    if (!isAuthenticated()) {
      saveRedirectUrl(window.location.href);
      navigate('/login', { replace: true });
      return;
    }

    // 2. 檢查是否有邀請碼
    if (!code) {
      setState('error');
      setError('無效的邀請連結');
      return;
    }

    // 3. 驗證邀請碼
    const verify = async () => {
      try {
        setState('verifying');
        const res = await verifyInvite(code);
        setInviteInfo(res);
        setState('preview');
      } catch (err: any) {
        if (err.message.includes('410') || err.message.includes('失效')) {
          setError('連結已失效或過期');
        } else {
          setError(err.message || '驗證邀請碼失敗');
        }
        setState('error');
      }
    };

    verify();
  }, [code, navigate]);

  const handleAccept = async () => {
    if (!code || isAccepting) return;

    try {
      setIsAccepting(true);
      const res = await acceptInvite(code);
      if (res.status === 'already_member') {
        setState('already_member');
      } else {
        setState('success');
        // 成功後 1.5 秒跳轉
        setTimeout(() => navigate('/family'), 1500);
      }
    } catch (err: any) {
      setError(err.message || '加入家族失敗');
      setState('error');
    } finally {
      setIsAccepting(false);
    }
  };

  const handleCancel = () => {
    navigate('/');
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="animate-rise w-full max-w-[400px] rounded-xl border border-hair bg-surface px-6 py-8 text-center shadow-modal">
        {state === 'verifying' || state === 'loading' ? (
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
              <button
                className={BTN_PRIMARY}
                onClick={handleAccept}
                disabled={isAccepting}
              >
                {isAccepting ? '加入中...' : '確認加入'}
              </button>
              <button
                className="cursor-pointer border-0 bg-transparent p-2.5 text-[0.9rem] text-faint transition-colors duration-140 hover:text-muted-foreground"
                onClick={handleCancel}
              >
                取消
              </button>
            </div>
          </div>
        ) : state === 'already_member' ? (
          <div className={RESULT_CLASS}>
            <div className={cn(ICON_BADGE, 'bg-[var(--primary-soft)] text-[var(--primary-strong)]')}>i</div>
            <h1 className={H1_CLASS}>已是成員</h1>
            <p>您已經在此家族成員名單中。</p>
            <button className={BTN_PRIMARY} onClick={() => navigate('/family')}>
              前往家族頁面
            </button>
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
            <button className={BTN_PRIMARY} onClick={() => navigate('/')}>
              回首頁
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default JoinPage;

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { verifyInvite, acceptInvite } from '../../api/familyApi';
import { isAuthenticated } from '../../utils/auth';
import { saveRedirectUrl } from '../../utils/redirect';
import type { VerifyInviteResponse } from '../../types/family';
import { CheckIcon, InfoIcon, XIcon } from 'lucide-react';
import { queryKeys } from '@/lib/queryClient';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';

// 'loading' 已由 inviteQuery.isPending 涵蓋（原本是手動先設 loading 再設 verifying）
type PageState = 'verifying' | 'preview' | 'error' | 'already_member' | 'success';

const JoinPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');

  // 接受邀請後的結果由使用者操作決定，其餘狀態皆可由查詢／變更推導
  const [outcome, setOutcome] = useState<'already_member' | 'success' | null>(null);
  const [acceptError, setAcceptError] = useState<string>('');

  // 未登入先導向登入頁（保留深連結）。
  // 回跳網址取 render 當下的 location，不讀 window.location：StrictMode（dev）會把
  // effect 跑兩次，第二次時網址已被第一次的 navigate 換成 /login。
  // 導向時也帶 ?redirect=（同 ProtectedRoute）：LIFF OAuth 回來時 sessionStorage 可能已被清掉。
  useEffect(() => {
    if (!isAuthenticated()) {
      const target = `${location.pathname}${location.search}`;
      saveRedirectUrl(target);
      navigate(`/login?redirect=${encodeURIComponent(target)}`, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

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
      setAcceptError(err instanceof Error ? err.message : t('family.join.error'));
    },
  });

  const inviteInfo: VerifyInviteResponse | null = inviteQuery.data ?? null;
  const isAccepting = acceptMutation.isPending;

  /** 驗證失敗的訊息對應（沿用原本對 410／失效的判斷） */
  const verifyErrorMessage = (() => {
    const err = inviteQuery.error;
    if (!err) return '';
    const message = err instanceof Error ? err.message : '';
    if (message.includes('410') || message.includes('失效')) return t('family.join.expired');
    return message || t('family.join.verifyError');
  })();

  const error = acceptError || verifyErrorMessage || (!code ? t('family.join.invalidCode') : '');

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

  // 100dvh 而非 100vh：iOS Safari 的 vh 以「網址列收起後」計算，
  // 捲動時列高變化會讓置中的卡片跳動。dvh 跟著實際可視高度走。
  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-4">
      <Card className="animate-in fade-in slide-in-from-bottom-2 duration-300 w-full max-w-[400px]">
        <CardContent>
          {state === 'verifying' ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia>
                  <Spinner className="size-8" />
                </EmptyMedia>
                <EmptyTitle>{t('family.join.processing')}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : state === 'preview' ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <Avatar className="size-20">
                <AvatarFallback className="bg-primary text-3xl font-extrabold text-primary-foreground">
                  {inviteInfo?.inviter_display_name?.charAt(0) || '?'}
                </AvatarFallback>
              </Avatar>
              <h1 className="text-xl font-extrabold">{t('family.join.title')}</h1>
              {/* 名字與後半句分開放，才能單獨替名字加底線；六種語言都是
                  「邀請人在前、動詞片語在後」的語序，拆開讀起來不會倒裝。 */}
              <p className="leading-relaxed text-muted-foreground">
                <span className="font-bold text-foreground underline decoration-primary underline-offset-4">
                  {inviteInfo?.inviter_display_name}
                </span>
                {' '}{t('family.join.invitedYou')}
              </p>
              <div className="flex w-full flex-col gap-2">
                <Button type="button" size="lg" onClick={handleAccept} disabled={isAccepting}>
                  {isAccepting ? t('family.join.accepting') : t('family.join.accept')}
                </Button>
                <Button type="button" variant="outline" onClick={handleCancel}>
                  {t('family.join.cancel')}
                </Button>
              </div>
            </div>
          ) : state === 'already_member' ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <InfoIcon />
                </EmptyMedia>
                <EmptyTitle>{t('family.join.alreadyMemberTitle')}</EmptyTitle>
                <EmptyDescription>{t('family.join.alreadyMemberDesc')}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button type="button" className="w-full" onClick={() => navigate('/family')}>
                  {t('family.join.goFamily')}
                </Button>
              </EmptyContent>
            </Empty>
          ) : state === 'success' ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon" className="bg-success-soft text-success">
                  <CheckIcon />
                </EmptyMedia>
                <EmptyTitle>{t('family.join.successTitle')}</EmptyTitle>
                <EmptyDescription>{t('family.join.success')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon" className="bg-destructive-soft text-destructive">
                  <XIcon />
                </EmptyMedia>
                <EmptyTitle>{t('family.join.invalidTitle')}</EmptyTitle>
                <EmptyDescription>{error}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button type="button" className="w-full" onClick={() => navigate('/')}>
                  {t('common.backHome')}
                </Button>
              </EmptyContent>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default JoinPage;

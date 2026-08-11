import React, { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
      <Card className="animate-in fade-in slide-in-from-bottom-2 duration-300 w-full max-w-[400px]">
        <CardContent>
          {state === 'verifying' ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia>
                  <Spinner className="size-8" />
                </EmptyMedia>
                <EmptyTitle>正在驗證邀請資訊...</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : state === 'preview' ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <Avatar className="size-20">
                <AvatarFallback className="bg-primary text-3xl font-extrabold text-primary-foreground">
                  {inviteInfo?.inviter_display_name?.charAt(0) || '?'}
                </AvatarFallback>
              </Avatar>
              <h1 className="text-xl font-extrabold">家族邀請</h1>
              <p className="leading-relaxed text-muted-foreground">
                <span className="font-bold text-foreground underline decoration-primary underline-offset-4">
                  {inviteInfo?.inviter_display_name}
                </span>
                {' '}邀請您加入他的家族族譜。
              </p>
              <div className="flex w-full flex-col gap-2">
                <Button type="button" size="lg" onClick={handleAccept} disabled={isAccepting}>
                  {isAccepting ? '加入中...' : '確認加入'}
                </Button>
                <Button type="button" variant="ghost" onClick={handleCancel}>
                  取消
                </Button>
              </div>
            </div>
          ) : state === 'already_member' ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <InfoIcon />
                </EmptyMedia>
                <EmptyTitle>已是成員</EmptyTitle>
                <EmptyDescription>您已經在此家族成員名單中。</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button type="button" className="w-full" onClick={() => navigate('/family')}>
                  前往家族頁面
                </Button>
              </EmptyContent>
            </Empty>
          ) : state === 'success' ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon" className="bg-success-soft text-success">
                  <CheckIcon />
                </EmptyMedia>
                <EmptyTitle>加入成功！</EmptyTitle>
                <EmptyDescription>正在為您導向家族頁面...</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon" className="bg-destructive-soft text-destructive">
                  <XIcon />
                </EmptyMedia>
                <EmptyTitle>連結無效</EmptyTitle>
                <EmptyDescription>{error}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button type="button" className="w-full" onClick={() => navigate('/')}>
                  回首頁
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

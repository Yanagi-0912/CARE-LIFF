import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronLeftIcon, ChevronRightIcon, TriangleAlertIcon, UserIcon } from 'lucide-react';

import { fetchMemberRoles, setFamilyRole } from '../../api/familyApi';
import { useFamily } from '../../hooks/useFamily';
import type { FamilyRole, FamilyRoleEntry } from '../../types/family';
import { ASSIGNABLE_FAMILY_ROLES, FAMILY_ROLE_LABEL_KEY } from '../../types/family';
import { queryKeys } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { RoleAssignmentNotice } from './RoleAssignmentNotice';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { Item, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface Props {
  onClose: () => void;
}

/** 每個角色配一句白話說明。長輩要能從這句話判斷該選哪個，而不是從角色名稱猜。 */
const EXPLAIN_KEY: Record<FamilyRole, string> = {
  OWNER: 'familyRole.explain.guardian', // 不會被渲染，OWNER 不是可指派的角色
  GUARDIAN: 'familyRole.explain.guardian',
  CAREGIVER: 'familyRole.explain.caregiver',
  MEMBER: 'familyRole.explain.member',
};

/**
 * 擁有者設定「誰能看我的哪些資料」。
 *
 * 幾件刻意的事：
 *
 * - **只列成員，不列自己。** 擁有者對自己的資料永遠是 OWNER，那是推導值，
 *   沒有可修改的對象。
 * - **未設定與「設為一般家人」分開顯示。** 直接把未設定畫成已選中的一般家人，
 *   擁有者會以為自己設定過了，於是永遠不會去設定。
 * - **頂端的提示照實際生效的狀態講。** 權限生效（enforced）時要明說未設定的
 *   人會以什麼權限處理；還沒生效（shadow）時要明說「現在每位家人都看得到」，
 *   而每個角色的說明要讀得出那是生效後的樣子。
 * - **一位家人一頁，左右滑動切換。** 原本是一排直向卡片，家人一多就要往下捲，
 *   三個角色按鈕與說明文字混在別人的卡片之間，長輩容易按到別人的。改成一次只
 *   看一位，眼前的三個按鈕一定是這位家人的。
 *
 * 滑動用原生 CSS scroll-snap，不引入 carousel 套件：LIFF WebView 的手勢就是
 * 瀏覽器的橫向捲動，不需要自己算 touch 座標；鍵盤 Tab 進看不見的那頁時瀏覽器也
 * 會自己把它捲進來。滑動不是唯一的切換方式——長輩不一定知道可以滑，所以另外給
 * 上一位／下一位按鈕與「第 x 位，共 n 位」，按鈕與計數是主要導覽，滑動是捷徑。
 */
export function RoleManagerDialog({ onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [savingId, setSavingId] = useState<string | null>(null);
  // 打開時先聚焦標題。實測預設會聚焦到最下面的「取消」，整個 dialog 因此
  // 一開就捲掉 150px，標題與最上面的權限提示都在畫面外。
  const titleRef = useRef<HTMLHeadingElement>(null);

  // 與族譜頁同一個 query key，命中快取不會多打一次。下面指派成功後會失效
  // familyTree：最後一位設定完、後端切成 enforced 時，提示會跟著換掉或消失。
  const { roleAssignment } = useFamily();
  const notYetEnforced = roleAssignment?.rbac_migration_state === 'shadow';

  const { data: entries, isPending, isError } = useQuery({
    queryKey: queryKeys.familyMemberRoles,
    queryFn: fetchMemberRoles,
  });

  const mutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: FamilyRole }) =>
      setFamilyRole(memberId, role),
    onSuccess: async (_data, variables) => {
      // 角色一變，族譜頁的 my_permissions、指派狀態與該成員的健康資料快取都可能
      // 過期。不失效的話，畫面會停在舊權限與舊提示上，直到 staleTime 過去。
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.familyTree }),
        queryClient.invalidateQueries({ queryKey: queryKeys.familyMemberRoles }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.memberProfile(variables.memberId),
        }),
      ]);
    },
  });

  const handleChange = async (entry: FamilyRoleEntry, role: FamilyRole) => {
    const name = entry.display_name || entry.user_id.slice(0, 8);
    setSavingId(entry.user_id);
    try {
      await mutation.mutateAsync({ memberId: entry.user_id, role });
      toast.success(t('familyRole.manage.saved', { name }));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('familyRole.manage.saveError'),
      );
    } finally {
      setSavingId(null);
    }
  };

  const list = entries ?? [];

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent initialFocus={titleRef} className="max-h-[85dvh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">
            {t('familyRole.manage.title')}
          </DialogTitle>
          <DialogDescription>{t('familyRole.manage.desc')}</DialogDescription>
        </DialogHeader>

        <RoleAssignmentNotice status={roleAssignment} />

        {isPending ? (
          // 骨架只畫一頁：載入完成後畫面也只會出現一位家人，形狀對得上
          <Item variant="outline" className="flex-col items-stretch gap-3" aria-busy="true">
            <div className="flex items-center gap-3.5">
              <ItemMedia>
                <Skeleton className="size-12 rounded-full" />
              </ItemMedia>
              <ItemContent>
                <Skeleton className="h-4 w-32" />
              </ItemContent>
            </div>
            <Skeleton className="h-11 w-full rounded-4xl" />
            <Skeleton className="h-11 w-full rounded-4xl" />
            <Skeleton className="h-11 w-full rounded-4xl" />
          </Item>
        ) : isError ? (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertDescription>{t('familyRole.manage.loadError')}</AlertDescription>
          </Alert>
        ) : (
        <MemberPager entries={list}>
            {(entry) => {
              const name = entry.display_name || entry.user_id.slice(0, 8);
              const busy = savingId === entry.user_id;
              return (
                <Item variant="outline" className="flex-col items-stretch gap-3">
                  <div className="flex items-center gap-3.5">
                    <ItemMedia>
                      <Avatar className="size-12">
                        <AvatarImage src={undefined} alt="" />
                        <AvatarFallback>
                          <UserIcon className="size-5" />
                        </AvatarFallback>
                      </Avatar>
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle className="text-base">{name}</ItemTitle>
                      {!entry.family_role && (
                        <p className="text-sm text-muted-foreground">
                          {t('familyRole.unassigned')}
                        </p>
                      )}
                    </ItemContent>
                    {busy && <Spinner />}
                  </div>

                  {/* 單選：一位成員只會有一個角色。用 ToggleGroup 而非一排
                      aria-pressed 的按鈕，方向鍵可在群組內移動焦點。
                      未設定時 value 為空陣列——不預先選中任何一個，
                      否則擁有者會以為已經設定過。
                      一頁只有一位家人，三個角色直排就好，不必再依寬度切換欄數。 */}
                  <ToggleGroup
                    variant="primary"
                    className="grid w-full grid-cols-1 gap-2"
                    value={entry.family_role ? [entry.family_role] : []}
                    onValueChange={(next) => {
                      const role = next[0] as FamilyRole | undefined;
                      if (role) void handleChange(entry, role);
                    }}
                    aria-label={t('familyRole.manage.roleFor', { name })}
                  >
                    {ASSIGNABLE_FAMILY_ROLES.map((role) => (
                      <ToggleGroupItem key={role} value={role} disabled={busy}>
                        {t(FAMILY_ROLE_LABEL_KEY[role])}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>

                  {/* 說明寫的是生效後的權限。還沒生效時照原句會變成謊話
                      （例如「一般家人看不到健康狀況」），所以前面標上「生效後」。 */}
                  {entry.family_role && (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {notYetEnforced
                        ? t('familyRole.explain.pending', {
                            text: t(EXPLAIN_KEY[entry.family_role]),
                          })
                        : t(EXPLAIN_KEY[entry.family_role])}
                    </p>
                  )}
                </Item>
              );
            }}
          </MemberPager>
        )}

        <DialogClose render={<Button type="button" variant="outline" className="mt-4 w-full" />}>
          {t('familyPermission.cancel')}
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

interface PagerProps {
  entries: FamilyRoleEntry[];
  children: (entry: FamilyRoleEntry) => ReactNode;
}

/**
 * 一位家人一頁的橫向分頁。
 *
 * 「目前在第幾頁」有兩個來源：按鈕按下去直接設，手指滑動則由 scroll 事件從
 * 捲動位置反推。兩邊都寫進同一個 state，所以滑到一半放手、scroll-snap 吸回去
 * 之後，計數與按鈕的停用狀態仍然對得上真正停在哪一頁。
 *
 * 捲動距離用容器的 clientWidth 而不是固定值：對話框在手機與桌機上寬度不同，
 * 字級 24px 時也會撐寬，每一頁都是「容器目前的寬度」。
 */
function MemberPager({ entries, children }: PagerProps) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const [rawIndex, setIndex] = useState(0);
  const total = entries.length;

  // 角色存檔後 entries 會重抓，人數理論上不變；但若真的變少（例如同時在別處
  // 移除成員），index 不能停在已經不存在的那頁。用推導值夾住，不用 effect
  // 回寫 state——那會多一次無謂的重繪。
  const index = Math.min(rawIndex, Math.max(0, total - 1));

  const scrollToPage = useCallback((next: number) => {
    const el = trackRef.current;
    if (!el) return;
    // 一頁的寬度就是容器可視寬度。jsdom 沒有排版，clientWidth 為 0，
    // 也沒有 scrollTo；這裡守住，讓 state 仍然會更新。
    const width = el.clientWidth;
    if (width > 0 && typeof el.scrollTo === 'function') {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo({ left: next * width, behavior: reduce ? 'auto' : 'smooth' });
    }
  }, []);

  const go = (next: number) => {
    const clamped = Math.min(Math.max(next, 0), total - 1);
    setIndex(clamped);
    scrollToPage(clamped);
  };

  const handleScroll = () => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    if (next !== index && next >= 0 && next < total) setIndex(next);
  };

  const canPrev = index > 0;
  const canNext = index < total - 1;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* 一位家人時沒有可切換的對象，導覽列整條不畫，免得長輩找「下一位」 */}
      {total > 1 && (
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => go(index - 1)}
            disabled={!canPrev}
            aria-label={t('familyRole.manage.prev')}
          >
            <ChevronLeftIcon />
          </Button>

          <div className="flex min-w-0 flex-col items-center gap-1.5">
            <p className="text-sm font-semibold" aria-live="polite">
              {t('familyRole.manage.pager', { current: index + 1, total })}
            </p>
            {/* 圓點只表示進度，不可點——太小，長輩按不準。切換交給兩側按鈕與滑動 */}
            <div className="flex gap-1.5" aria-hidden="true">
              {entries.map((entry, i) => (
                <span
                  key={entry.user_id}
                  className={cn(
                    'size-2 rounded-full transition-colors',
                    i === index ? 'bg-primary' : 'bg-border',
                  )}
                />
              ))}
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => go(index + 1)}
            disabled={!canNext}
            aria-label={t('familyRole.manage.next')}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      )}

      {/* overscroll-x-contain：滑到最後一頁再往前撥，不要把整個對話框或
          背後的頁面一起帶走。每頁 px-0.5 py-0.5 是留給 focus ring 的位置，
          否則 3px 的環會被 overflow 容器切掉。 */}
      <div
        ref={trackRef}
        onScroll={handleScroll}
        role="group"
        aria-roledescription="carousel"
        aria-label={t('familyRole.manage.title')}
        className="flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {entries.map((entry, i) => (
          <div
            key={entry.user_id}
            role="group"
            aria-roledescription="slide"
            aria-label={t('familyRole.manage.pager', { current: i + 1, total })}
            className="w-full shrink-0 snap-center px-0.5 py-0.5"
          >
            {children(entry)}
          </div>
        ))}
      </div>

      {total > 1 && (
        <p className="text-center text-sm text-muted-foreground">
          {t('familyRole.manage.swipeHint')}
        </p>
      )}
    </div>
  );
}

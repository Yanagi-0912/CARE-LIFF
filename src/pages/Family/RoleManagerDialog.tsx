import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { InfoIcon, TriangleAlertIcon, UserIcon } from 'lucide-react';

import { fetchMemberRoles, setFamilyRole } from '../../api/familyApi';
import type { FamilyRole, FamilyRoleEntry } from '../../types/family';
import { ASSIGNABLE_FAMILY_ROLES, FAMILY_ROLE_LABEL_KEY } from '../../types/family';
import { queryKeys } from '@/lib/queryClient';

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
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
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
 * - **未設定的成員要明說會以什麼權限處理。** 沉默的預設值在這裡特別危險：
 *   他以為沒做的事等於沒有後果，實際上他正把某個人留在最低權限。
 */
export function RoleManagerDialog({ onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: entries, isPending, isError } = useQuery({
    queryKey: queryKeys.familyMemberRoles,
    queryFn: fetchMemberRoles,
  });

  const mutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: FamilyRole }) =>
      setFamilyRole(memberId, role),
    onSuccess: async (_data, variables) => {
      // 角色一變，族譜頁的 my_permissions 與該成員的健康資料快取都可能過期。
      // 不失效的話，畫面會停在舊權限上，直到 staleTime 過去。
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

  const unassignedCount = (entries ?? []).filter((e) => !e.family_role).length;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t('familyRole.manage.title')}</DialogTitle>
          <DialogDescription>{t('familyRole.manage.desc')}</DialogDescription>
        </DialogHeader>

        {isPending ? (
          <ItemGroup className="gap-3" aria-busy="true">
            {[0, 1].map((i) => (
              <Item key={i} variant="outline">
                <ItemMedia>
                  <Skeleton className="size-12 rounded-full" />
                </ItemMedia>
                <ItemContent>
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-11 w-full rounded-xl" />
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        ) : isError ? (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertDescription>{t('familyRole.manage.loadError')}</AlertDescription>
          </Alert>
        ) : (
          <>
            {unassignedCount > 0 && (
              // 「還有幾位沒設定，他們現在是什麼權限」要講出來。
              <Alert>
                <InfoIcon />
                <AlertDescription>
                  {t('familyRole.unassignedNotice', { count: unassignedCount })}
                </AlertDescription>
              </Alert>
            )}

            <ItemGroup className="gap-3">
              {(entries ?? []).map((entry) => {
                const name = entry.display_name || entry.user_id.slice(0, 8);
                const busy = savingId === entry.user_id;
                return (
                  <Item key={entry.user_id} variant="outline" className="flex-col items-stretch gap-3">
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
                        否則擁有者會以為已經設定過。 */}
                    <ToggleGroup
                      variant="primary"
                      className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3"
                      value={entry.family_role ? [entry.family_role] : []}
                      onValueChange={(next) => {
                        const role = next[0] as FamilyRole | undefined;
                        if (role) void handleChange(entry, role);
                      }}
                      aria-label={t('familyRole.manage.title')}
                    >
                      {ASSIGNABLE_FAMILY_ROLES.map((role) => (
                        <ToggleGroupItem key={role} value={role} disabled={busy}>
                          {t(FAMILY_ROLE_LABEL_KEY[role])}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>

                    {entry.family_role && (
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {t(EXPLAIN_KEY[entry.family_role])}
                      </p>
                    )}
                  </Item>
                );
              })}
            </ItemGroup>
          </>
        )}

        <DialogClose render={<Button type="button" variant="ghost" className="mt-4 w-full" />}>
          {t('familyPermission.cancel')}
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

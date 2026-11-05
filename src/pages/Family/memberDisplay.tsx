import { useTranslation } from 'react-i18next';
import { ShieldAlertIcon, ShieldCheckIcon } from 'lucide-react';

import type { FamilyMember, FamilyRole } from '../../types/family';
import { FAMILY_ROLE_LABEL_KEY } from '../../types/family';
import { cn } from '@/lib/utils';
import { memberName } from './memberUtils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

export function MemberAvatar({ member, className }: { member: FamilyMember; className?: string }) {
  const name = memberName(member);
  return (
    <Avatar className={cn('size-16', className)}>
      <AvatarImage src={member.picture_url} alt="" />
      <AvatarFallback className="bg-accent text-2xl font-bold text-accent-foreground">
        {name.charAt(0)}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * 「已設定權限／未設定權限」徽章加角色名。顏色、圖示、文字三重編碼。
 * 未設定不能畫成一般家人：擁有者會以為自己設定過了。
 */
export function RoleStatus({ role, className }: { role: FamilyRole | null | undefined; className?: string }) {
  const { t } = useTranslation();
  // h-auto + whitespace-normal：Badge 內建 nowrap，特大字級下會撐出橫向捲動
  const badge = 'h-auto py-0.5 text-sm whitespace-normal';
  return (
    <span className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
      {role ? (
        <Badge className={cn(badge, 'bg-success-soft text-success')}>
          <ShieldCheckIcon aria-hidden="true" />
          {t('familyMember.roleSet')}
        </Badge>
      ) : (
        <Badge className={cn(badge, 'bg-warning-soft text-warning')}>
          <ShieldAlertIcon aria-hidden="true" />
          {t('familyMember.roleUnset')}
        </Badge>
      )}
      {role && <span className="text-sm text-muted-foreground">{t(FAMILY_ROLE_LABEL_KEY[role])}</span>}
    </span>
  );
}

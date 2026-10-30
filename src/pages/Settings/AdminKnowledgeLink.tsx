import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRightIcon, ShieldCheckIcon } from 'lucide-react';
import { getPersonalHealthProfile } from '@/api/profileApi';
import { queryKeys } from '@/lib/queryClient';
import { isAdminRole } from '@/utils/roles';
import { isAuthenticated } from '@/utils/auth';

/** 首頁精簡後，管理員在手機上仍可從設定進入審核佇列。 */
export default function AdminKnowledgeLink() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: profile } = useQuery({
    queryKey: queryKeys.myProfile,
    queryFn: () => getPersonalHealthProfile(),
    enabled: isAuthenticated(),
  });
  if (!isAdminRole(profile?.role)) return null;
  return (
    <button className="care-entry-row mb-6" type="button" onClick={() => navigate('/admin/knowledge-reports')}>
      <ShieldCheckIcon className="size-6 shrink-0 text-primary" aria-hidden="true" />
      <span className="flex-1 text-base font-semibold">{t('home.adminKnowledgeReports')}</span>
      <ChevronRightIcon className="size-5 shrink-0" aria-hidden="true" />
    </button>
  );
}

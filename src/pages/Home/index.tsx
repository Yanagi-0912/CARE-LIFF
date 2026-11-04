import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowRightIcon, BookOpenIcon, ClipboardListIcon, HeartPulseIcon, MapPinIcon, MicIcon, ShieldCheckIcon, TagsIcon,
} from 'lucide-react';
import { getPersonalHealthProfile } from '@/api/profileApi';
import { queryKeys } from '@/lib/queryClient';
import { isAdminRole } from '@/utils/roles';
import { isAuthenticated } from '@/utils/auth';

const features = [
  { title: 'home.nearbyTitle', desc: 'home.nearbyShort', icon: MapPinIcon, path: '/nearby-hospitals', tone: 'green' },
  { title: 'tools.healthRecords', desc: 'home.recordsShort', icon: HeartPulseIcon, path: '/health-records', tone: 'coral' },
  { title: 'tools.clinicVisits', desc: 'home.clinicShort', icon: MicIcon, path: '/clinic-visits', tone: 'amber' },
  { title: 'visits.title', desc: 'tools.visitsShort', icon: ClipboardListIcon, path: '/reminders/medications/visits', tone: 'amber' },
  { title: 'home.knowledgeReports', desc: 'home.reportsShort', icon: BookOpenIcon, path: '/knowledge-reports', tone: 'violet' },
  { title: 'home.adminKnowledgeReports', desc: 'tools.adminOnly', icon: ShieldCheckIcon, path: '/admin/knowledge-reports', tone: 'coral', adminOnly: true },
  { title: 'sidebar.annotations', desc: 'tools.adminOnly', icon: TagsIcon, path: '/admin/annotations', tone: 'violet', adminOnly: true },
] as const;

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // 與 AdminRoute 共用同一個查詢；手機沒有其他地方點得到管理頁，卡片只對管理員顯示。
  const { data: profile } = useQuery({
    queryKey: queryKeys.myProfile,
    queryFn: () => getPersonalHealthProfile(),
    enabled: isAuthenticated(),
  });
  const isAdmin = isAdminRole(profile?.role);
  return (
    <div className="mx-auto max-w-[60rem]">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold leading-relaxed">{t('tools.title')}</h1>
        <p className="mt-1 text-base text-muted-foreground">{t('home.introDesc')}</p>
      </div>
      <section data-testid="home-features" className="care-home-grid">
        {features.filter(f => !('adminOnly' in f) || isAdmin).map(({ title, desc, icon: Icon, path, tone }) => (
          <button key={path} type="button" className="care-feature" onClick={() => navigate(path)}>
            <span className="flex w-full items-center justify-between gap-2">
              <span className={`care-feature-icon care-tone-${tone}`}><Icon className="size-7" strokeWidth={1.8} aria-hidden="true" /></span>
              <ArrowRightIcon className="size-5 shrink-0 text-faint" aria-hidden="true" />
            </span>
            <span className="flex flex-col gap-1">
              <strong className="text-xl leading-relaxed">{t(title)}</strong>
              <span className="text-sm leading-relaxed text-muted-foreground">{t(desc)}</span>
            </span>
          </button>
        ))}
      </section>
    </div>
  );
}

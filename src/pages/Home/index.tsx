import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRightIcon, BookOpenIcon, HeartPulseIcon, MapPinIcon, MicIcon } from 'lucide-react';

const features = [
  { title: 'home.nearbyTitle', desc: 'home.nearbyShort', icon: MapPinIcon, path: '/nearby-hospitals', tone: 'green' },
  { title: 'home.healthRecords', desc: 'home.recordsShort', icon: HeartPulseIcon, path: '/health-records', tone: 'coral' },
  { title: 'home.clinicVisits', desc: 'home.clinicShort', icon: MicIcon, path: '/clinic-visits', tone: 'amber' },
  { title: 'home.knowledgeReports', desc: 'home.reportsShort', icon: BookOpenIcon, path: '/knowledge-reports', tone: 'violet' },
];

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-[60rem]">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold leading-relaxed">{t('home.introTitle')}</h1>
        <p className="mt-1 text-base text-muted-foreground">{t('home.introDesc')}</p>
      </div>
      <section data-testid="home-features" className="care-home-grid">
        {features.map(({ title, desc, icon: Icon, path, tone }) => (
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

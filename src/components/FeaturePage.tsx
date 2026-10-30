import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeftIcon, ChevronRightIcon, type LucideIcon } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

/** 新版分類頁共用標題；每個子頁保留可直接開啟的網址。 */
export function FeaturePage({ title, description, backTo, children }: {
  title: string;
  description?: string;
  backTo?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [title]);
  return <div className="mx-auto w-full max-w-[48rem]">
    <header className="mb-6 flex items-start gap-3">
      {backTo && <Link to={backTo} aria-label={t('personalHealth.return')}
        className={buttonVariants({ variant: 'outline', size: 'icon', className: 'shrink-0 rounded-full' })}>
        <ArrowLeftIcon aria-hidden="true" />
      </Link>}
      <div className="min-w-0">
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-extrabold leading-relaxed outline-none wrap-anywhere">{title}</h1>
        {description && <p className="mt-1 text-base text-muted-foreground">{description}</p>}
      </div>
    </header>
    {children}
  </div>;
}

export function EntryLink({ to, title, description, icon: Icon }: {
  to: string;
  title: string;
  description?: string;
  icon: LucideIcon;
}) {
  return <Link to={to} className="care-entry-row">
    <span className="care-entry-icon"><Icon aria-hidden="true" /></span>
    <span className="min-w-0 flex-1 wrap-anywhere">
      <strong className="block text-lg">{title}</strong>
      {description && <span className="block text-sm text-muted-foreground">{description}</span>}
    </span>
    <ChevronRightIcon className="size-5 shrink-0 text-faint" aria-hidden="true" />
  </Link>;
}

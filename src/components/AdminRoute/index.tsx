import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getPersonalHealthProfile } from '../../api/profileApi';
import { isAdminRole } from '../../utils/roles';

function AdminRoute({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [state, setState] = useState<'loading' | 'allowed' | 'denied'>('loading');

  useEffect(() => {
    let cancelled = false;

    async function checkAdmin() {
      try {
        const profile = await getPersonalHealthProfile();
        if (!cancelled) {
          setState(isAdminRole(profile?.role) ? 'allowed' : 'denied');
        }
      } catch {
        if (!cancelled) {
          setState('denied');
        }
      }
    }

    void checkAdmin();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'loading') {
    return (
      <p className="mx-auto my-8 text-center text-muted-foreground" role="status">
        {t('adminKnowledgeReports.checkingAccess')}
      </p>
    );
  }

  if (state === 'denied') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default AdminRoute;

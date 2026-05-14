import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import liff from '@line/liff';
import { acceptInvitation, FamilyApiError } from '../../../api/familyApi';
import { useI18n } from '../../../i18n';
import './index.css';

const LIFF_ID = import.meta.env.VITE_LIFF_ID || '';
const REDIRECT_DELAY_MS = 1500;
const ERROR_MESSAGE_KEYS: Record<string, string> = {
  INVITE_EXPIRED: 'family.join.expired',
  INVITE_ALREADY_USED: 'family.join.alreadyUsed',
  INVITE_INVALID: 'family.join.invalidCode',
  LINE_CLIENT_REQUIRED: 'family.inviteLineRequired',
};

type JoinStatus = 'loading' | 'success' | 'error';

const FamilyJoinPage = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<JoinStatus>('loading');
  const [message, setMessage] = useState('');

  const inviteCode = useMemo(() => {
    return searchParams.get('code')?.trim() || '';
  }, [searchParams]);

  useEffect(() => {
    let mounted = true;
    let redirectTimer: ReturnType<typeof window.setTimeout> | undefined;

    const run = async () => {
      if (!inviteCode) {
        if (!mounted) return;
        setStatus('error');
        setMessage(t('family.join.invalidCode'));
        return;
      }

      try {
        if (LIFF_ID) {
          await liff.init({ liffId: LIFF_ID });
          if (!liff.isLoggedIn()) {
            liff.login({ redirectUri: window.location.href });
            return;
          }
        }

        await acceptInvitation(inviteCode);
        if (!mounted) return;
        setStatus('success');
        setMessage(t('family.join.success'));
        redirectTimer = window.setTimeout(() => navigate('/family'), REDIRECT_DELAY_MS);
      } catch (err) {
        if (!mounted) return;
        setStatus('error');
        if (err instanceof FamilyApiError) {
          const key = err.code ? ERROR_MESSAGE_KEYS[err.code] : undefined;
          if (key) {
            setMessage(t(key));
            return;
          }
        }
        setMessage(t('family.join.error'));
      }
    };

    run();
    return () => {
      mounted = false;
      if (redirectTimer) {
        window.clearTimeout(redirectTimer);
      }
    };
  }, [inviteCode, navigate, t]);

  return (
    <div className="family-join-page">
      <div className="family-join-card">
        <h2>{t('family.join.title')}</h2>
        {status === 'loading' && <p>{t('family.join.processing')}</p>}
        {status !== 'loading' && <p>{message}</p>}
      </div>
    </div>
  );
};

export default FamilyJoinPage;

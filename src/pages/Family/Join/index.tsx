import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { acceptInvitation, FamilyApiError } from '../../../api/familyApi';
import { useI18n } from '../../../i18n';
import './index.css';

const LIFF_ID = import.meta.env.VITE_LIFF_ID || '';

type JoinStatus = 'loading' | 'success' | 'error';

const FamilyJoinPage = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [status, setStatus] = useState<JoinStatus>('loading');
  const [message, setMessage] = useState('');

  const inviteCode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('code')?.trim() || '';
  }, []);

  useEffect(() => {
    let mounted = true;
    let redirectTimer: number | undefined;

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
        redirectTimer = window.setTimeout(() => navigate('/family'), 1500);
      } catch (err) {
        if (!mounted) return;
        setStatus('error');
        if (err instanceof FamilyApiError) {
          if (err.code === 'INVITE_EXPIRED') {
            setMessage(t('family.join.expired'));
            return;
          }
          if (err.code === 'INVITE_ALREADY_USED') {
            setMessage(t('family.join.alreadyUsed'));
            return;
          }
          if (err.code === 'INVITE_INVALID') {
            setMessage(t('family.join.invalidCode'));
            return;
          }
          if (err.code === 'LINE_CLIENT_REQUIRED') {
            setMessage(t('family.inviteLineRequired'));
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

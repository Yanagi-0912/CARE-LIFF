import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { verifyInvite, acceptInvite } from '../../api/familyApi';
import { isAuthenticated } from '../../utils/auth';
import { saveRedirectUrl } from '../../utils/redirect';
import type { VerifyInviteResponse } from '../../types/family';
import './index.css';

type PageState = 'loading' | 'verifying' | 'preview' | 'error' | 'already_member' | 'success';

const JoinPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');

  const [state, setState] = useState<PageState>('loading');
  const [inviteInfo, setInviteInfo] = useState<VerifyInviteResponse | null>(null);
  const [error, setError] = useState<string>('');
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    // 1. 檢查是否登入
    if (!isAuthenticated()) {
      saveRedirectUrl(window.location.href);
      navigate('/login', { replace: true });
      return;
    }

    // 2. 檢查是否有邀請碼
    if (!code) {
      setState('error');
      setError('無效的邀請連結');
      return;
    }

    // 3. 驗證邀請碼
    const verify = async () => {
      try {
        setState('verifying');
        const res = await verifyInvite(code);
        setInviteInfo(res);
        setState('preview');
      } catch (err: any) {
        if (err.message.includes('410') || err.message.includes('失效')) {
          setError('連結已失效或過期');
        } else {
          setError(err.message || '驗證邀請碼失敗');
        }
        setState('error');
      }
    };

    verify();
  }, [code, navigate]);

  const handleAccept = async () => {
    if (!code || isAccepting) return;

    try {
      setIsAccepting(true);
      const res = await acceptInvite(code);
      if (res.status === 'already_member') {
        setState('already_member');
      } else {
        setState('success');
        // 成功後 1.5 秒跳轉
        setTimeout(() => navigate('/family'), 1500);
      }
    } catch (err: any) {
      setError(err.message || '加入家族失敗');
      setState('error');
    } finally {
      setIsAccepting(false);
    }
  };

  const handleCancel = () => {
    navigate('/');
  };

  return (
    <div className="join-container">
      <div className="join-card">
        {state === 'verifying' || state === 'loading' ? (
          <div className="status-container">
            <div className="loader"></div>
            <p>正在驗證邀請資訊...</p>
          </div>
        ) : state === 'preview' ? (
          <div className="preview-content">
            <div className="inviter-avatar">
              {inviteInfo?.inviter_display_name?.charAt(0) || '?'}
            </div>
            <h1>家族邀請</h1>
            <p className="invite-text">
              <span className="inviter-name">{inviteInfo?.inviter_display_name}</span>
              {' '}邀請您加入他的家族族譜。
            </p>
            <div className="actions">
              <button 
                className={`btn-primary ${isAccepting ? 'loading' : ''}`}
                onClick={handleAccept}
                disabled={isAccepting}
              >
                {isAccepting ? '加入中...' : '確認加入'}
              </button>
              <button className="btn-link" onClick={handleCancel}>
                取消
              </button>
            </div>
          </div>
        ) : state === 'already_member' ? (
          <div className="result-content">
            <div className="icon-info">i</div>
            <h1>已是成員</h1>
            <p>您已經在此家族成員名單中。</p>
            <button className="btn-primary" onClick={() => navigate('/family')}>
              前往家族頁面
            </button>
          </div>
        ) : state === 'success' ? (
          <div className="result-content">
            <div className="icon-success">✓</div>
            <h1>加入成功！</h1>
            <p>正在為您導向家族頁面...</p>
          </div>
        ) : (
          <div className="result-content">
            <div className="icon-error">×</div>
            <h1>連結無效</h1>
            <p>{error}</p>
            <button className="btn-primary" onClick={() => navigate('/')}>
              回首頁
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default JoinPage;

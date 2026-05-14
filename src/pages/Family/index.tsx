import { useI18n } from '../../i18n';
import { useLiff } from '../../hooks/useLiff';
import { useToast } from '../../hooks/useToast';
import { useFamily } from './useFamily';
import { MemberCard } from './MemberCard';
import { InviteButton } from './InviteButton';

const FamilyPage = () => {
  const { t } = useI18n();
  const { liffReady } = useLiff();
  const { members, loading, error, refetch } = useFamily();
  const { toast, showToast } = useToast();

  return (
    <div className="family-page">
      {/* Toast */}
      {toast && (
        <div className={`family-toast ${toast.type}`}>{toast.msg}</div>
      )}

      {/* 標題列 */}
      <header className="family-header">
        <h2>👥 {t('family.title')}</h2>
        <InviteButton
          liffReady={liffReady}
          onSuccess={() => {
            showToast(t('family.inviteSuccess'), 'success');
            refetch();
          }}
          onError={(msg) => showToast(msg, 'error')}
        />
      </header>

      {/* 內容區 */}
      {loading ? (
        <div className="family-empty">
          <p>載入中…</p>
        </div>
      ) : error ? (
        <div className="family-empty">
          <div className="empty-icon">❌</div>
          <p>{error}</p>
        </div>
      ) : members.length === 0 ? (
        <div className="family-empty">
          <div className="empty-icon">👨‍👩‍👧‍👦</div>
          <p>{t('family.empty')}</p>
        </div>
      ) : (
        <section className="member-grid">
          {members.map((m) => (
            <MemberCard key={m.user_id} member={m} />
          ))}
        </section>
      )}
    </div>
  );
};

export default FamilyPage;

import { useI18n } from '../../i18n';
import { useLiff } from '../../hooks/useLiff';
import { useToast } from '../../hooks/useToast';
import { useFamily } from './useFamily';
import { MemberCard } from './MemberCard';
import { InviteButton } from './InviteButton';
import { RELATIONSHIP_LABEL } from '../../types/family';
import type { FamilyMember } from '../../types/family';


/** LIFF App ID — 由環境變數注入，或留空讓 init 時跳過 */
const LIFF_ID = import.meta.env.VITE_LIFF_ID || '';

const FamilyPage = () => {
  const { t } = useI18n();
  const { liffReady } = useLiff();
  const { members, loading, error, refetch } = useFamily();
  const { toast, showToast } = useToast();

  /* ── 顯示名稱 (方案 A：優先使用 display_name，否則顯示 user_id 前 8 碼) ── */
  const getDisplayName = (m: FamilyMember) => m.display_name || m.user_id.slice(0, 8);

  /* ── 顯示稱謂 ──────────────────────────────────────── */
  const getRelationLabel = (m: FamilyMember) => {
    if (!m.relationship_type) return t('family.unset');
    return RELATIONSHIP_LABEL[m.relationship_type] || m.relationship_type;
  };

  /* ── render ────────────────────────────────────────── */
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

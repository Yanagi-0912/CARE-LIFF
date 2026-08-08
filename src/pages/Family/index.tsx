import { useTranslation } from 'react-i18next';
import { useLiff } from '../../hooks/useLiff';
import { useToast } from '../../hooks/useToast';
import { useFamily } from '../../hooks/useFamily';
import { MemberCard } from './MemberCard';
import { InviteButton } from './InviteButton';
import { cn } from '@/lib/utils';
import * as S from './styles';

const FamilyPage = () => {
  const { t } = useTranslation();
  const { liffReady } = useLiff();
  const { members, loading, error, refetch } = useFamily();
  const { toast, showToast } = useToast();

  /* ── render ────────────────────────────────────────── */
  return (
    <div className={S.PAGE}>
      {/* Toast */}
      {toast && (
        <div className={cn(S.TOAST, S.TOAST_TONE[toast.type])}>{toast.msg}</div>
      )}

      {/* 標題列 */}
      <header className={S.HEADER}>
        <h2 className={S.HEADER_H2}>👥 {t('family.title')}</h2>
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
        <div className={S.EMPTY}>
          <p className={S.EMPTY_P}>載入中…</p>
        </div>
      ) : error ? (
        <div className={S.EMPTY}>
          <div className={S.EMPTY_ICON}>❌</div>
          <p className={S.EMPTY_P}>{error}</p>
        </div>
      ) : members.length === 0 ? (
        <div className={S.EMPTY}>
          <div className={S.EMPTY_ICON}>👨‍👩‍👧‍👦</div>
          <p className={S.EMPTY_P}>{t('family.empty')}</p>
        </div>
      ) : (
        <section className={S.GRID}>
          {members.map((m, i) => (
            <MemberCard key={m.user_id} member={m} delayMs={40 + i * 60} />
          ))}
        </section>
      )}
    </div>
  );
};

export default FamilyPage;

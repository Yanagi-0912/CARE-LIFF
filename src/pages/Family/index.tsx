import { useI18n } from '../../i18n';
import { useLiff } from '../../hooks/useLiff';
import { useToast } from '../../hooks/useToast';
import { useFamily } from './useFamily';
import { MemberCard } from './MemberCard';
import { InviteButton } from './InviteButton';
import { fetchFamilyTree, createInvitation } from '../../api/familyApi';
import { RELATIONSHIP_LABEL } from '../../types/family';
import type { FamilyMember } from '../../types/family';
import './index.css';

/** LIFF App ID — 由環境變數注入，或留空讓 init 時跳過 */
const LIFF_ID = import.meta.env.VITE_LIFF_ID || '';
const LINE_CLIENT_REQUIRED_ERROR = 'LIFF initialization failed: LINE client required';

/** 暫用 mock userId（MVP）；後續整合 LIFF 登入後由 liff.getProfile() 取得 */
const MOCK_USER_ID = '123456789';

const FamilyPage = () => {
  const { t } = useI18n();
  const { liffReady } = useLiff();
  const { members, loading, error, refetch } = useFamily();
  const { toast, showToast } = useToast();

  /* ── state ─────────────────────────────────────────── */
  const [members, setMembers]   = useState<FamilyMember[]>([]);
  const [loading, setLoading]   = useState(true);
  const [inviting, setInviting] = useState(false);
  const [toast, setToast]       = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  /* ── toast 自動消失 ────────────────────────────────── */
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /* ── 載入族譜 ──────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetchFamilyTree(MOCK_USER_ID);
        setMembers(res.family_tree.family_members);
      } catch (err) {
        console.error('載入族譜失敗:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ── 邀請流程 ──────────────────────────────────────── */
  const handleInvite = useCallback(async () => {
    setInviting(true);
    try {
      // 1. 後端產生邀請連結
      const { invite_url } = await createInvitation();

      // Initialize LIFF
      if (LIFF_ID) {
        try {
          await liff.init({ liffId: LIFF_ID });
        } catch (initErr) {
          console.warn('LIFF initialization failed in current environment.', initErr);
          throw new Error(LINE_CLIENT_REQUIRED_ERROR);
        }
      }

      // Compose Flex Message and call shareTargetPicker
      if (!liff.isApiAvailable('shareTargetPicker')) {
        throw new Error(LINE_CLIENT_REQUIRED_ERROR);
      }

      const result = await liff.shareTargetPicker([
        {
          type: 'flex',
          altText: t('family.shareTitle'),
          contents: {
            type: 'bubble',
            hero: {
              type: 'image',
              url: 'https://developers.line.biz/assets/images/services/bot-designer-icon.png',
              size: 'full',
              aspectRatio: '20:13',
              aspectMode: 'cover',
            },
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: t('family.shareTitle'),
                  weight: 'bold',
                  size: 'lg',
                },
                {
                  type: 'text',
                  text: t('family.shareDesc'),
                  size: 'sm',
                  color: '#999999',
                  margin: 'md',
                  wrap: true,
                },
              ],
            },
            footer: {
              type: 'box',
              layout: 'vertical',
              spacing: 'sm',
              contents: [
                {
                  type: 'button',
                  style: 'primary',
                  color: '#06c755',
                  action: {
                    type: 'uri',
                    label: t('family.inviteBtn'),
                    uri: invite_url,
                  },
                },
              ],
            },
          },
        },
      ]);

      if (result === null) {
        // shareTargetPicker returns null when user closes/cancels the picker
        return;
      }

      setToast({ msg: t('family.inviteSuccess'), type: 'success' });
    } catch (err) {
      console.error('Invitation failed:', err);
      const msg = err instanceof Error && err.message === LINE_CLIENT_REQUIRED_ERROR
        ? t('family.inviteLineRequired')
        : t('family.inviteError');
      setToast({ msg, type: 'error' });
    } finally {
      setInviting(false);
    }
  }, [t]);

  /* ── 顯示名稱（MVP：user_id 前 6 碼；方案 A 擴充後用 display_name）── */
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

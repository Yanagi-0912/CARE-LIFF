import { useState, useCallback } from 'react';
import { getPersonalHealthProfile } from '../../api/profileApi';
import type { HealthProfile } from '../../api/profileApi';
import type { FamilyMember } from '../../types/family';
import { RELATIONSHIP_LABEL } from '../../types/family';
import { useI18n } from '../../i18n';

interface Props {
  member: FamilyMember;
}

/**
 * 成員卡片 — 點擊展開顯示該成員的健康狀況
 */
export function MemberCard({ member }: Props) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [health, setHealth] = useState<HealthProfile | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const displayName = member.display_name || member.user_id.slice(0, 8);
  const relationLabel = member.relationship_type
    ? (RELATIONSHIP_LABEL[member.relationship_type] || member.relationship_type)
    : t('family.unset');

  const handleClick = useCallback(async () => {
    const willExpand = !expanded;
    setExpanded(willExpand);

    // 第一次展開時才載入健康資料（lazy loading）
    // 後端應透過 JWT 驗證請求者是否有權限查看該成員資料
    if (willExpand && !health && !healthLoading) {
      setHealthLoading(true);
      setHealthError(null);
      try {
        const data = await getPersonalHealthProfile(member.user_id);
        setHealth(data);
      } catch (err) {
        setHealthError(err instanceof Error ? err.message : '無法載入健康資料');
      } finally {
        setHealthLoading(false);
      }
    }
  }, [expanded, health, healthLoading, member.user_id]);

  const isDefaultProfile = health && (
    health.age === 0 &&
    health.gender === 'unknown' &&
    health.height === 1.0 &&
    health.weight === 1.0 &&
    !health.chronic_history &&
    !health.major_illness_history &&
    !health.surgery_history
  );

  const hasAnyData = health && !isDefaultProfile && (
    (health.age != null && health.age !== 0) ||
    (health.gender && health.gender !== 'unknown') ||
    (health.height != null && health.height !== 1.0) ||
    (health.weight != null && health.weight !== 1.0) ||
    health.chronic_history ||
    health.major_illness_history ||
    health.surgery_history
  );

  return (
    <div
      className={`member-card ${expanded ? 'expanded' : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') void handleClick(); }}
    >
      {/* 頭像 */}
      <div className="member-avatar">
        {member.picture_url ? (
          <img src={member.picture_url} alt={displayName} />
        ) : (
          '👤'
        )}
      </div>

      {/* LINE 名稱 */}
      <span className="member-name">{displayName}</span>

      {/* 稱謂 */}
      <span className={`member-relation ${!member.relationship_type ? 'unset' : ''}`}>
        {relationLabel}
      </span>

      {/* 展開箭頭提示 */}
      <span className="member-expand-hint">{expanded ? '▲' : '▼'}</span>

      {/* 展開的健康狀況 */}
      {expanded && (
        <div className="member-health-detail" onClick={(e) => e.stopPropagation()}>
          {healthLoading ? (
            <p className="health-loading">載入健康資料中…</p>
          ) : healthError ? (
            <p className="health-error">⚠️ {healthError}</p>
          ) : hasAnyData ? (
            <div className="health-fields">
              {health!.age != null && health!.age !== 0 && (
                <div className="health-field">
                  <span className="health-label">年齡</span>
                  <span className="health-value">{health!.age} 歲</span>
                </div>
              )}
              {health!.gender && (
                <div className="health-field">
                  <span className="health-label">性別</span>
                  <span className="health-value">{health!.gender === 'unknown' ? '未設定' : health!.gender}</span>
                </div>
              )}
              {((health!.height != null && health!.height !== 1.0) || (health!.weight != null && health!.weight !== 1.0)) && (
                <div className="health-field">
                  <span className="health-label">身體指標</span>
                  <span className="health-value">
                    {health!.height != null && health!.height !== 1.0 ? `${health!.height} cm` : ''}
                    {health!.height != null && health!.height !== 1.0 && health!.weight != null && health!.weight !== 1.0 ? ' / ' : ''}
                    {health!.weight != null && health!.weight !== 1.0 ? `${health!.weight} kg` : ''}
                  </span>
                </div>
              )}
              {health!.chronic_history && (
                <div className="health-field">
                  <span className="health-label">慢性病史</span>
                  <span className="health-value">{health!.chronic_history}</span>
                </div>
              )}
              {health!.major_illness_history && (
                <div className="health-field">
                  <span className="health-label">重大疾病</span>
                  <span className="health-value">{health!.major_illness_history}</span>
                </div>
              )}
              {health!.surgery_history && (
                <div className="health-field">
                  <span className="health-label">手術記錄</span>
                  <span className="health-value">{health!.surgery_history}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="health-empty">尚無健康資料</p>
          )}
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFamily } from '../../../hooks/useFamily';
import { getLineUserId } from '../../../utils/auth';
import { canReadSensitive } from '../../../utils/familyPermissions';
import { useVisits } from './useVisits';
import { VisitList } from './VisitList';

/** 讀取本人 LINE userId；未登入時回 undefined（API 省略參數即為本人） */
function readSelfUserId(): string | undefined {
  try {
    return getLineUserId();
  } catch {
    return undefined;
  }
}

/**
 * 看診紀錄頁。
 *
 * 對象選單只列**具備 SENSITIVE 讀取權**的家人，與用藥提醒頁用 `canReadGeneral`
 * 不同：那一頁的主體（藥名、時段）是 GENERAL，這一頁的主體（看診機構）是
 * SENSITIVE。列出沒有權限的對象，使用者選了只會拿到 403——不如一開始就不列，
 * 而且列出來本身就洩漏了「他有幾個家人」之外的資訊。
 */
export default function VisitsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { members } = useFamily();

  const [selfUserId] = useState(readSelfUserId);
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(selfUserId);

  const options = useMemo(() => {
    const self = { userId: selfUserId, name: t('visits.title') };
    const family = (members ?? [])
      .filter((member) => canReadSensitive(member))
      .map((member) => ({
        userId: member.user_id as string | undefined,
        name: member.display_name || t('family.unset'),
      }))
      .filter((option) => option.userId && option.userId !== selfUserId);
    return [self, ...family];
  }, [members, selfUserId, t]);

  const isSelf = !selectedUserId || selectedUserId === selfUserId;
  const selectedName = options.find((o) => o.userId === selectedUserId)?.name ?? '';
  const { visits, loading, error, forbidden } = useVisits(
    isSelf ? undefined : selectedUserId,
  );

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/medications')}
          aria-label={t('visits.title')}
        >
          <ArrowLeftIcon />
        </Button>
        <div>
          <h1 className="text-lg font-semibold">
            {isSelf ? t('visits.title') : t('visits.titleForMember', { name: selectedName })}
          </h1>
          <p className="text-muted-foreground text-sm">{t('visits.description')}</p>
        </div>
      </div>

      {options.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <Button
              key={option.userId ?? 'self'}
              size="sm"
              variant={option.userId === selectedUserId ? 'default' : 'outline'}
              onClick={() => setSelectedUserId(option.userId)}
            >
              {option.name}
            </Button>
          ))}
        </div>
      ) : null}

      <VisitList visits={visits} loading={loading} error={error} forbidden={forbidden} />
    </div>
  );
}

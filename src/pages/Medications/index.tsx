import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFamily } from '../../hooks/useFamily';
import { getLineUserId } from '../../utils/auth';
import type {
  MedicationReminder,
  MedicationSlotType,
  UpdateReminderRequest,
} from '../../types/medication';
import { ReminderCard } from './ReminderCard';
import { ReminderEditDialog } from './ReminderEditDialog';
import { ReminderFormDialog } from './ReminderFormDialog';
import { useMedications } from './useMedications';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import * as S from './styles';

/** 讀取本人 LINE userId；未登入時回 undefined（列表 API 省略參數即為本人） */
function readSelfUserId(): string | undefined {
  try {
    return getLineUserId();
  } catch {
    return undefined;
  }
}

const MedicationsPage = () => {
  const { t } = useTranslation();
  const { members } = useFamily();

  const [selfUserId] = useState(readSelfUserId);
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(selfUserId);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MedicationReminder | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const { reminders, loading, error, create, update, remove } = useMedications(selectedUserId);

  const targets = useMemo(
    () => [
      { userId: selfUserId, name: t('meds.self') },
      ...members.map((member) => ({
        userId: member.user_id as string | undefined,
        name: member.display_name || t('family.unset'),
      })),
    ],
    [selfUserId, members, t],
  );

  const selectedName =
    targets.find((target) => target.userId === selectedUserId)?.name ?? t('meds.self');

  const existingSlots = useMemo<MedicationSlotType[]>(
    () => reminders.map((reminder) => reminder.slot_type),
    [reminders],
  );

  const handleToggle = async (reminder: MedicationReminder) => {
    setTogglingId(reminder.id);
    try {
      await update(reminder.id, { enabled: !reminder.enabled });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('meds.updateFailed'));
    } finally {
      setTogglingId(null);
    }
  };

  const handleCreate = async (
    slots: MedicationSlotType[],
    startDate: string,
    endDate?: string,
  ) => {
    // 未取得本人 userId 時 getLineUserId 會拋錯，訊息由 dialog 就地顯示
    const userId = selectedUserId ?? getLineUserId();
    const created = await create({
      user_id: userId,
      slots,
      start_date: startDate,
      end_date: endDate,
    });
    setAdding(false);
    toast.success(t('meds.add.success', { n: created.length }));
  };

  const handleSave = async (patch: UpdateReminderRequest) => {
    if (!editing) return;
    await update(editing.id, patch);
    setEditing(null);
    toast.success(t('meds.edit.saveSuccess'));
  };

  const handleDelete = async () => {
    if (!editing) return;
    await remove(editing.id);
    setEditing(null);
    toast.success(t('meds.edit.deleteSuccess'));
  };

  return (
    <div className={S.PAGE}>
      <header className={S.HEADER}>
        <h1 className={S.HEADER_H1}>{t('meds.title')}</h1>
        <button type="button" className={S.BTN_PRIMARY} onClick={() => setAdding(true)}>
          ＋{t('meds.addButton')}
        </button>
      </header>

      <div className={S.CHIPS_ROW} role="group" aria-label={t('meds.targetLabel')}>
        {targets.map((target) => (
          <button
            key={target.userId ?? 'self'}
            type="button"
            className={cn(S.CHIP, target.userId === selectedUserId && S.CHIP_ACTIVE)}
            aria-pressed={target.userId === selectedUserId}
            onClick={() => setSelectedUserId(target.userId)}
          >
            {target.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={S.EMPTY}>
          <p className={S.EMPTY_P}>{t('meds.loading')}</p>
        </div>
      ) : error ? (
        <div className={S.EMPTY}>
          <span className={S.EMPTY_ICON} aria-hidden="true">
            !
          </span>
          <h2 className={S.EMPTY_H2}>{t('meds.loadError')}</h2>
          <p className={S.EMPTY_P}>{error}</p>
        </div>
      ) : reminders.length === 0 ? (
        <div className={S.EMPTY}>
          <span className={S.EMPTY_ICON} aria-hidden="true">
            ○
          </span>
          <h2 className={S.EMPTY_H2}>{t('meds.empty', { name: selectedName })}</h2>
          <p className={S.EMPTY_P}>{t('meds.emptyHint')}</p>
        </div>
      ) : (
        <section className={S.LIST} aria-label={t('meds.listLabel')}>
          {reminders.map((reminder) => (
            <ReminderCard
              key={reminder.id}
              reminder={reminder}
              busy={togglingId === reminder.id}
              onToggle={handleToggle}
              onEdit={setEditing}
            />
          ))}
        </section>
      )}

      {adding && (
        <ReminderFormDialog
          targetName={selectedName}
          existingSlots={existingSlots}
          onSubmit={handleCreate}
          onClose={() => setAdding(false)}
        />
      )}

      {editing && (
        <ReminderEditDialog
          reminder={editing}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
};

export default MedicationsPage;

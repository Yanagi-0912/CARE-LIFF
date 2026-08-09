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
import { PlusIcon, PillIcon, TriangleAlertIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

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
    <div className="mx-auto max-w-[760px]">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">{t('meds.title')}</h1>
        <Button type="button" className="shrink-0 rounded-full" onClick={() => setAdding(true)}>
          <PlusIcon data-icon="inline-start" />
          {t('meds.addButton')}
        </Button>
      </header>

      {/* 對象切換是互斥的單選，用 ToggleGroup 而非一排各自 aria-pressed 的按鈕：
          語意正確，且方向鍵可在群組內移動焦點。
          userId 可能為 undefined（本人），以 'self' 當作群組內的識別值。 */}
      <ToggleGroup
        variant="primary"
        className="mb-4 flex w-full gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        value={[selectedUserId ?? 'self']}
        onValueChange={(groupValue) => {
          const next = groupValue[0];
          if (next === undefined) return;
          setSelectedUserId(next === 'self' ? selfUserId : next);
        }}
        aria-label={t('meds.targetLabel')}
      >
        {targets.map((target) => (
          <ToggleGroupItem key={target.userId ?? 'self'} value={target.userId ?? 'self'}>
            {target.name}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {loading ? (
        // 骨架屏用與 ReminderCard 同一組 Item 元件，卡片外框自然對齊，
        // 不必再手寫一份 rounded/border/padding
        <ItemGroup className="gap-3" aria-busy="true" aria-label={t('meds.loading')}>
          {[0, 1].map((i) => (
            <Item key={i} variant="outline">
              <ItemMedia>
                <Skeleton className="size-11 rounded-xl" />
              </ItemMedia>
              <ItemContent>
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-4 w-40" />
              </ItemContent>
              <ItemActions>
                <Skeleton className="h-6 w-11 rounded-full" />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      ) : error ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlertIcon />
            </EmptyMedia>
            <EmptyTitle>{t('meds.loadError')}</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : reminders.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PillIcon />
            </EmptyMedia>
            <EmptyTitle>{t('meds.empty', { name: selectedName })}</EmptyTitle>
            <EmptyDescription>{t('meds.emptyHint')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup className="gap-3" aria-label={t('meds.listLabel')}>
          {reminders.map((reminder) => (
            <ReminderCard
              key={reminder.id}
              reminder={reminder}
              busy={togglingId === reminder.id}
              onToggle={handleToggle}
              onEdit={setEditing}
            />
          ))}
        </ItemGroup>
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

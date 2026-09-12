import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ReminderTarget } from './useReminderTargets';

interface ReminderTargetToggleProps {
  targets: ReminderTarget[];
  selectedUserId: string | undefined;
  selfUserId: string | undefined;
  onSelect: (userId: string | undefined) => void;
}

/**
 * 提醒對象切換，用藥與掛號兩個分頁共用。
 *
 * 對象切換是互斥的單選，用 ToggleGroup 而非一排各自 aria-pressed 的按鈕：
 * 語意正確，且方向鍵可在群組內移動焦點。
 * userId 可能為 undefined（本人），以 'self' 當作群組內的識別值。
 */
export function ReminderTargetToggle({
  targets,
  selectedUserId,
  selfUserId,
  onSelect,
}: ReminderTargetToggleProps) {
  const { t } = useTranslation();

  return (
    <ToggleGroup
      variant="primary"
      className="mb-4 flex w-full gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      value={[selectedUserId ?? 'self']}
      onValueChange={(groupValue) => {
        const next = groupValue[0];
        if (next === undefined) return;
        onSelect(next === 'self' ? selfUserId : next);
      }}
      aria-label={t('meds.targetLabel')}
    >
      {targets.map((target) => (
        <ToggleGroupItem key={target.userId ?? 'self'} value={target.userId ?? 'self'}>
          {target.name}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

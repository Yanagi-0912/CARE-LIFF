import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getLineUserId } from '../../utils/auth';
import { canManageMedications } from '../../utils/familyPermissions';
import { useReminderTargets } from '../Reminders/useReminderTargets';
import { ReminderTargetToggle } from '../Reminders/ReminderTargetToggle';
import type {
  MedicationReminder,
  MedicationSlotType,
  ReminderEntry,
  UpdateReminderRequest,
} from '../../types/medication';
import type { PrescriptionCommitResult, PrescriptionDraft } from '../../types/prescription';
import { ReminderCard } from './ReminderCard';
import { PrescriptionScanDialog } from './PrescriptionScanDialog';
import { PrescriptionDraftForm } from './PrescriptionDraftForm';
import { DetailedSetupView } from './DetailedSetupView';
import { usePrescriptionScanEnabled } from './usePrescriptionScanEnabled';
import { useMedications } from './useMedications';
import { buildCommitSummary } from './commitSummary';
import { toast } from 'sonner';
import { BuildingIcon, PlusIcon, PillIcon, ScanLineIcon, TriangleAlertIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';

const MedicationsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // 對象清單與權限判斷和掛號分頁共用，見 useReminderTargets
  const { selfUserId, targets, selectedUserId, setSelectedUserId, selectedName, canEditSelected } =
    useReminderTargets(canManageMedications);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [draft, setDraft] = useState<PrescriptionDraft | null>(null);
  // 詳細設定是同一頁內的整頁檢視，不另開路由（design.md 決策 8：LIFF webview
  // 換路徑會重掛整頁、重打 API，在長輩裝置上明顯卡頓）。
  const [view, setView] = useState<'list' | 'detailed'>('list');
  // 手動新增與修改提醒一律走詳細設定（原本的簡易新增／編輯視窗已移除）：
  // 「新增」不預選時段，停在四張時段卡；點提醒卡片則帶入該筆規則的時段，
  // 直接跳進那個時段的編輯面。
  const [detailedSlot, setDetailedSlot] = useState<MedicationSlotType | undefined>(undefined);

  const scanEnabled = usePrescriptionScanEnabled();
  const { reminders, loading, error, create, update, remove, refetch } = useMedications(selectedUserId);

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

  const openDetailed = (slot?: MedicationSlotType) => {
    setDetailedSlot(slot);
    setView('detailed');
  };

  // 該時段尚未有規則 → 走建立（帶 slot_entries）；refetch 是因為 create／update
  // 的回應不含 medications（只有 GET /reminders 會附上），詳細檢視第一層的
  // 摘要與藥品指派畫面都需要重新整份的提醒清單才會是正確的。
  const handleDetailedCreate = async (payload: {
    slot: MedicationSlotType;
    entries: ReminderEntry[];
    startDate: string;
    endDate?: string;
  }) => {
    // 未取得本人 userId 時 getLineUserId 會拋錯，訊息由編輯面就地顯示
    const userId = selectedUserId ?? getLineUserId();
    await create({
      user_id: userId,
      slots: [payload.slot],
      slot_entries: { [payload.slot]: payload.entries },
      start_date: payload.startDate,
      end_date: payload.endDate,
    });
    await refetch();
    toast.success(t('meds.detailed.saveSuccess'));
  };

  const handleDetailedUpdate = async (reminderId: string, patch: UpdateReminderRequest) => {
    await update(reminderId, patch);
    await refetch();
    toast.success(t('meds.detailed.saveSuccess'));
  };

  const handleDetailedDelete = async (reminderId: string) => {
    await remove(reminderId);
    toast.success(t('meds.edit.deleteSuccess'));
  };

  // 辨識成功只交出草稿，不代表任何藥品或提醒已建立——確認閘門在
  // PrescriptionDraftForm 裡，使用者仍需核對並提交才會真正寫入。
  const handleScanned = (scanned: PrescriptionDraft) => {
    setScanning(false);
    setDraft(scanned);
  };

  // 三種失敗原因與使用者直接關閉視窗，都要能落回手動建立提醒的路徑（詳細設定）。
  const handleManualFallback = () => {
    setScanning(false);
    openDetailed();
  };

  // 送出後的訊息要反映「這次到底發生了什麼」，不能只看 prn_medication_ids——
  // 使用者也可能在核對畫面主動勾了「這個藥不用定時提醒我」，或這次提交
  // 重新開啟了某個原本已關閉的時段（見 PrescriptionDraftForm 送出前的
  // 警示）。totalCount／noReminderCount 由表單在送出當下算出並隨
  // onCommitted 一起帶回來，reactivated_slots 則是後端的權威回報。
  const handleCommitted = async (
    result: PrescriptionCommitResult,
    facts: { totalCount: number; noReminderCount: number },
  ) => {
    setDraft(null);
    await refetch();
    toast.success(buildCommitSummary(t, { result, ...facts }));
  };

  return (
    <div className="mx-auto max-w-[760px]">
      {/* 詳細設定取代清單區塊與頂端的新增／掃描入口，但對象 chips 與已載入的
          提醒資料都保留（design.md 決策 8）——換對象或返回清單都不必重打 API。 */}
      {view === 'list' && (
        // 按鈕文字寬度隨語言與字級變動（六種語言 × 16/20/24px），固定欄數的 Grid
        // 不是讓長譯文撐出格子、就是永遠單欄，所以按鈕群用可換行的 flex：每顆按鈕
        // 維持單行文字，放不下才整顆換到下一行，並以 grow 佔滿所在的那一行。
        // - < 768px：按鈕群自成一列、佔滿寬度（w-full）。375px＋24px 字級下是
        //   「看診紀錄｜掃描藥袋」一行，主要動作「新增」獨佔下一行全寬。
        // - ≥ 768px（md:w-auto）：放得下就與標題同列靠右，與原本相同；放不下
        //   （768px＋24px 字級，側欄佔去 240px）才換到下一列，排法同手機。
        // 原本按鈕群是 shrink-0 且不換行，24px 字級下寬 501px，「新增」被推出視窗外。
        // 頁面一旦橫向溢出，Chromium 還會把 layout viewport 撐成內容寬度，寬度以
        // 視窗百分比計算的 position: fixed dialog 會跟著變寬、一起超出畫面
        // （Playwright 量到編輯提醒 dialog 因此寬 458px；WebKit 不會撐，仍是 327px）。
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold">{t('meds.title')}</h1>
          <div className="flex w-full flex-wrap gap-2 md:w-auto">
            {/* 看診紀錄入口。**不受 canEditSelected 影響**——那是寫入權，而看
                紀錄是讀取行為；能看到這一頁的人就該看得到入口。權限不足時由
                目標頁自己顯示「沒有權限」，比在這裡靜靜藏起入口好：使用者至少
                知道有這個功能存在，而不是以為系統沒有。 */}
            <Button
              type="button"
              variant="outline"
              className="grow rounded-full"
              onClick={() => navigate('/reminders/medications/visits')}
            >
              <BuildingIcon data-icon="inline-start" />
              {t('visits.title')}
            </Button>
            {/* 功能開關關閉時 usePrescriptionScanEnabled 回傳 false，入口整個不渲染，
                而不是渲染成停用狀態——關閉時要表現得像這個功能不存在一樣。
                沒有寫入權時同理：兩個入口一併不渲染。 */}
            {scanEnabled && canEditSelected && (
              <Button
                type="button"
                variant="outline"
                className="grow rounded-full"
                onClick={() => setScanning(true)}
              >
                <ScanLineIcon data-icon="inline-start" />
                {t('meds.scan.entry')}
              </Button>
            )}
            {canEditSelected && (
              <Button type="button" className="grow rounded-full" onClick={() => openDetailed()}>
                <PlusIcon data-icon="inline-start" />
                {t('meds.addButton')}
              </Button>
            )}
          </div>
        </header>
      )}

      {/* 與掛號分頁共用；只有讀取權的對象，上方的新增與掃描入口不會渲染 */}
      <ReminderTargetToggle
        targets={targets}
        selectedUserId={selectedUserId}
        selfUserId={selfUserId}
        onSelect={(userId) => {
          setSelectedUserId(userId);
          // 切換照顧對象時，若還停在詳細設定畫面就要退回清單：詳細設定的
          // SlotEntryEditor 是依 selectedUserId 載入的藥品清單建構表單，
          // 留在原地換對象會讓使用者看著 A 的表單、儲存卻套用到 B 身上。
          if (view === 'detailed') {
            setView('list');
            setDetailedSlot(undefined);
          }
        }}
      />

      {view === 'detailed' ? (
        <DetailedSetupView
          targetUserId={selectedUserId}
          targetName={selectedName}
          reminders={reminders}
          remindersLoading={loading}
          remindersError={error}
          initialSlot={detailedSlot}
          onBack={() => setView('list')}
          onCreate={handleDetailedCreate}
          onUpdate={handleDetailedUpdate}
          onDelete={handleDetailedDelete}
        />
      ) : loading ? (
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
              onEdit={(reminder: MedicationReminder) => openDetailed(reminder.slot_type)}
            />
          ))}
        </ItemGroup>
      )}

      {scanning && (
        <PrescriptionScanDialog
          onScanned={handleScanned}
          onManualFallback={handleManualFallback}
          onClose={() => setScanning(false)}
        />
      )}

      {draft && (
        <PrescriptionDraftForm
          draft={draft}
          onCommitted={(result, facts) => void handleCommitted(result, facts)}
          onClose={() => setDraft(null)}
        />
      )}
    </div>
  );
};

export default MedicationsPage;

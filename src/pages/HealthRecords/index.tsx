import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CalendarHeartIcon,
  DropletIcon,
  FootprintsIcon,
  HeartPulseIcon,
  LockIcon,
  RotateCwIcon,
  TriangleAlertIcon,
} from 'lucide-react';

import { useFamily } from '../../hooks/useFamily';
import { getLineUserId } from '../../utils/auth';
import { canReadHealthRecords, canRecordHealthFor } from '../../utils/familyPermissions';
import { getPersonalHealthProfile } from '../../api/profileApi';
import { queryKeys } from '@/lib/queryClient';
import { MeasurementTab } from './MeasurementTab';
import { MenstrualTab } from './MenstrualTab';
import { StepsTab } from './StepsTab';

import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type TabKey = 'blood_pressure' | 'blood_glucose' | 'menstrual' | 'steps';

/** 讀取本人 LINE userId；未登入時回 undefined（省略即代表本人，同其他頁的慣例） */
function readSelfUserId(): string | undefined {
  try {
    return getLineUserId();
  } catch {
    return undefined;
  }
}

/**
 * 健康紀錄頁（9.1）：血壓、血糖、經期、步數四個分頁。
 *
 * 查看對象放在網址而非 state（同 `PersonalHealth/ConsultRecords` 的慣例）：
 * `?user=<memberId>` 看家人的紀錄，省略或帶自己的 id 都視為看本人。看家人
 * 需要 `canReadHealthRecords`——沒有權限時整頁 SHALL NOT 送出任何健康資料
 * 請求，只顯示「沒有權限」（task-8-11-dispatch-notes.md「Task 9」）。
 *
 * `?tab=` 選擇預設分頁，帶了未知值或當下不該出現的分頁（例如男性使用者
 * 網址帶了 `tab=menstrual`）一律退回第一個分頁。
 */
export default function HealthRecordsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selfUserId] = useState(readSelfUserId);
  const { members, loading: familyLoading, error: familyError, refetch: refetchFamily } = useFamily();

  const requestedUserId = searchParams.get('user')?.trim() || '';
  const targetUserId =
    requestedUserId && requestedUserId !== selfUserId ? requestedUserId : undefined;
  const isViewingFamily = targetUserId !== undefined;

  const requestedMember = members.find((member) => member.user_id === requestedUserId);

  // 族譜抓失敗（`familyError`）跟「這位家人沒有把權限開給我」是兩件事：
  // 前者要講「載入失敗，請重試」，後者才是「沒有權限」。抓失敗時 `members`
  // 是空陣列，一定找不到 requestedMember，若不特別分辨會被下面的
  // fail-closed 邏輯一併吃成「沒有權限」——對一個網路不穩、剛好重新整理就
  // 會好的使用者來說，這是一句沒有出路的假話（review：no retry path）。
  const familyLoadFailed = isViewingFamily && !familyLoading && Boolean(familyError);

  // fail-closed：族譜還沒載完、或找不到這位成員時，一律當成沒有權限——
  // 同 familyPermissions.ts 的方向，寧可少顯示，不要先打了必定 403 的請求。
  const canReadTarget =
    !isViewingFamily || Boolean(requestedMember && canReadHealthRecords(requestedMember));
  const canWriteTarget =
    !isViewingFamily || Boolean(requestedMember && canRecordHealthFor(requestedMember));
  const deniedByPermission =
    isViewingFamily && !familyLoading && !familyLoadFailed && !canReadTarget;

  // 只有 isViewingFamily 時下面的標題才會用到 targetName（health.title 走
  // 另一支不帶名字的文案）；!isViewingFamily 時這裡算出什麼都不影響畫面，
  // 不需要另外一個「我自己」的字串分支（同一原因移除了原本的
  // `health.self` key——那個分支的值從來沒有被渲染過）。
  const targetName = requestedMember?.display_name || t('family.unset');

  // 性別只在看自己時才需要查——經期是 PERSONAL 分類，沒有代看，這支查詢
  // 與首頁、側欄共用同一個 key，多半已經有快取。
  const { data: myProfile } = useQuery({
    queryKey: queryKeys.myProfile,
    queryFn: () => getPersonalHealthProfile(),
    enabled: !isViewingFamily,
  });
  const myGender =
    myProfile?.gender && myProfile.gender !== 'unknown' ? myProfile.gender : '';
  // 性別未知（還沒讀到、或讀到但未設定）時先讓分頁出現：內容會是「請先設定性別」
  // 的引導，而不是讓分頁在讀到「其實是女性」之後才憑空冒出來。只有確定是男性
  // 才整個分頁鈕都不渲染（dispatch notes「male/other → tab hidden」）。
  const showMenstrualTab = !isViewingFamily && myGender !== 'male';

  const tabs = useMemo(() => {
    const list: { key: TabKey; labelKey: string; Icon: typeof HeartPulseIcon }[] = [
      { key: 'blood_pressure', labelKey: 'health.tab.bloodPressure', Icon: HeartPulseIcon },
      { key: 'blood_glucose', labelKey: 'health.tab.bloodGlucose', Icon: DropletIcon },
    ];
    if (showMenstrualTab) {
      list.push({ key: 'menstrual', labelKey: 'health.tab.menstrual', Icon: CalendarHeartIcon });
    }
    list.push({ key: 'steps', labelKey: 'health.tab.steps', Icon: FootprintsIcon });
    return list;
  }, [showMenstrualTab]);

  const requestedTab = searchParams.get('tab');
  const activeTab = tabs.some((tab) => tab.key === requestedTab)
    ? (requestedTab as TabKey)
    : tabs[0].key;

  const handleTabChange = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    // replace：切分頁不該在返回鍵上堆出一長串歷史（同 ConsultRecords 切換對象）
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="mx-auto flex w-full max-w-[800px] flex-col gap-4 p-4">
      <header>
        <h1 className="text-2xl font-extrabold">
          {isViewingFamily ? t('health.titleForMember', { name: targetName }) : t('health.title')}
        </h1>
        <p className="mt-1 text-muted-foreground">{t('health.description')}</p>
      </header>

      {isViewingFamily && familyLoading ? (
        <p className="flex items-center gap-2 py-6 text-base text-muted-foreground" role="status">
          <Spinner aria-hidden="true" />
          {t('health.loading')}
        </p>
      ) : familyLoadFailed ? (
        // 族譜抓失敗：講「載入失敗」並給重試，不要落到下面的「沒有權限」
        // ——那會告訴使用者一件沒有發生過的事，還沒有出路（見上面的說明）。
        // 同樣 fail-closed：失敗時不顯示任何健康資料或分頁。
        <div className="flex flex-col gap-3 py-6">
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>{t('health.loadError')}</AlertTitle>
          </Alert>
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => void refetchFamily()}
          >
            <RotateCwIcon data-icon="inline-start" />
            {t('health.retry')}
          </Button>
        </div>
      ) : deniedByPermission ? (
        // 沒有權限就不渲染分頁與內容：見頁面頂端的說明，這裡也 SHALL NOT
        // 送出任何健康資料請求。
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LockIcon />
            </EmptyMedia>
            <EmptyTitle>{t('familyPermission.noSensitive')}</EmptyTitle>
            <EmptyDescription>{t('familyPermission.askOwner')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Tabs value={activeTab} onValueChange={(value) => handleTabChange(String(value))}>
          <TabsList className="w-full" aria-label={t('health.tabListLabel')}>
            {tabs.map(({ key, labelKey, Icon }) => (
              <TabsTrigger key={key} value={key}>
                <Icon data-icon="inline-start" />
                {t(labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="blood_pressure">
            <MeasurementTab
              kind="blood_pressure"
              targetUserId={targetUserId}
              canRead={canReadTarget}
              canWrite={canWriteTarget}
            />
          </TabsContent>
          <TabsContent value="blood_glucose">
            <MeasurementTab
              kind="blood_glucose"
              targetUserId={targetUserId}
              canRead={canReadTarget}
              canWrite={canWriteTarget}
            />
          </TabsContent>
          {showMenstrualTab && (
            <TabsContent value="menstrual">
              <MenstrualTab />
            </TabsContent>
          )}
          <TabsContent value="steps">
            <StepsTab targetUserId={targetUserId} canRead={canReadTarget} isSelf={!isViewingFamily} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

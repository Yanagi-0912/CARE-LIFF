import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithToaster } from './testUtils';
import FamilyPage from '../pages/Family';
import { FamilySection } from '../pages/Family/FamilySection';
import * as profileApi from '../api/profileApi';
import * as familyApi from '../api/familyApi';
import * as healthApi from '../api/healthApi';
import type {
  FamilyMember,
  FamilyPermissions,
  FamilyRole,
  FamilyRoleAssignmentStatus,
  FamilyRoleEntry,
  GetFamilyTreeResponse,
} from '../types/family';
import type { HealthMeasurement, StepCount } from '../types/health';
import { todayTaipei } from '../lib/taipeiCalendar';
import i18n from '../i18n';

vi.mock('../api/profileApi', () => ({
  getPersonalHealthProfile: vi.fn(),
  proxyUpsertHealthProfile: vi.fn(),
}));

vi.mock('../api/familyApi', () => ({
  createInvite: vi.fn(),
  fetchFamilyTree: vi.fn(),
  fetchMemberRoles: vi.fn(),
  setFamilyRole: vi.fn(),
  removeFamilyMember: vi.fn(),
  setRelationship: vi.fn(),
}));

vi.mock('../api/healthApi', () => ({
  fetchMeasurements: vi.fn(),
  fetchStepCounts: vi.fn(),
}));

vi.mock('../hooks/useLiff', () => ({
  useLiff: () => ({ liffReady: true }),
}));

vi.mock('@line/liff', () => ({
  default: { isApiAvailable: () => false, shareTargetPicker: vi.fn() },
}));

const familyState = {
  members: [] as FamilyMember[],
  roleAssignment: null as FamilyRoleAssignmentStatus | null,
  loading: false,
  error: null as string | null,
  refetch: vi.fn(),
};

/**
 * 預設回傳上面那份手動控制的 familyState。`familyMode.real` 打開時改用真的
 * useFamily（資料來自被 mock 的 fetchFamilyTree），給「指派 → 失效 familyTree →
 * 重抓 → 提示換掉」這條路徑用：那條路徑只有真的 hook 走得到。
 * 同一次 render 裡模式不會變，hook 的呼叫順序因此是固定的。
 */
const familyMode = { real: false };
function pickFamily(realHook: () => unknown) {
  return familyMode.real ? realHook() : familyState;
}

vi.mock('../hooks/useFamily', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useFamily')>();
  return { useFamily: () => pickFamily(actual.useFamily) };
});

/**
 * 後端在 enforced 狀態下對四種角色回的 `my_permissions`。
 *
 * 這裡刻意把矩陣抄一份**只當測試資料**，不從 production 程式碼推導——若前端
 * 哪天自己重算了權限，這份固定資料才擋得住；用同一個推導函式產生期望值的
 * 測試會跟著錯下去。
 */
const PERMISSIONS: Record<FamilyRole, FamilyPermissions> = {
  OWNER: { general: ['READ', 'WRITE'], sensitive: ['READ', 'WRITE'], private: ['READ', 'WRITE'] },
  GUARDIAN: { general: ['READ', 'WRITE'], sensitive: ['READ', 'WRITE'], private: ['READ'] },
  CAREGIVER: { general: ['READ', 'WRITE'], sensitive: ['READ'], private: [] },
  MEMBER: { general: ['READ'], sensitive: [], private: [] },
};

function memberAs(role: FamilyRole | null): FamilyMember {
  return {
    user_id: 'U-mom',
    relationship_type: 'parent',
    display_name: '媽媽',
    my_role: role ?? undefined,
    my_permissions: role ? PERMISSIONS[role] : undefined,
  };
}

/**
 * 帶嚴格權限（`my_strict_permissions`）的成員，給健康紀錄區塊（血壓血糖、
 * 步數）的測試用——那些查詢一律看嚴格判定，不受影子模式放寬。
 *
 * `strictRole` 省略時 `my_strict_permissions` 維持 undefined（等同後端沒帶
 * 這個欄位），fail-closed 成沒有權限；這是影子模式案例要的形狀：`my_permissions`
 * 可以是放寬後的值，`my_strict_permissions` 卻是真正生效中的（通常較嚴格）角色。
 */
function memberWithStrict(
  role: FamilyRole | null,
  strictRole: FamilyRole | null,
  overrides: Partial<FamilyMember> = {},
): FamilyMember {
  return {
    ...memberAs(role),
    my_strict_permissions: strictRole ? PERMISSIONS[strictRole] : undefined,
    ...overrides,
  };
}

function assignment(
  overrides: Partial<FamilyRoleAssignmentStatus> = {},
): FamilyRoleAssignmentStatus {
  return {
    owner_id: 'U-me',
    is_complete: false,
    unassigned_member_ids: [],
    rbac_migration_state: 'shadow',
    ...overrides,
  };
}

/** shadow 且還有人沒設定時的提示（中文沒有單複數之分，_one／_other 同一句） */
const shadowPending = (count: number) =>
  `還有 ${count} 位家人尚未設定權限。全部設定好之前，所有家人都看得到您的健康狀況與對話紀錄；設定好後權限才會生效。`;

/** `/health-records?user=...` 的替身路由：只回報網址帶了哪個 user id，
 *  不用真的渲染健康紀錄頁——這裡要驗證的是代記入口導到了哪裡。 */
function HealthRecordsProbe() {
  const [params] = useSearchParams();
  return <div>health-records-for:{params.get('user')}</div>;
}

/** 預設開媽媽的家人資料頁；健康首頁的家人區塊掛在 /personalhealth。 */
function renderPage(path = '/family/members/U-mom') {
  return renderWithToaster(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/family/*" element={<FamilyPage />} />
        <Route path="/personalhealth" element={<FamilySection />} />
        <Route path="/personalhealth/consult" element={<div>consult</div>} />
        <Route path="/health-records" element={<HealthRecordsProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function expandCard() {
  await waitFor(() => expect(screen.getByText('健康狀況')).toBeInTheDocument());
}

describe('家人資料頁依權限降級', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue({ age: 68 });
    familyState.roleAssignment = null;
    familyState.loading = false;
    familyState.error = null;
    await i18n.changeLanguage('zh-TW');
  });

  it('GUARDIAN 看得到健康狀況、對話紀錄，也能代填', async () => {
    familyState.members = [memberAs('GUARDIAN')];
    renderPage();
    await expandCard();

    await waitFor(() =>
      expect(profileApi.getPersonalHealthProfile).toHaveBeenCalledWith('U-mom'),
    );
    expect(screen.getByRole('button', { name: /查看諮詢紀錄/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /幫忙填健康資料/ })).toBeInTheDocument();
  });

  it('CAREGIVER 看得到健康狀況，但沒有對話紀錄、也不能代填', async () => {
    familyState.members = [memberAs('CAREGIVER')];
    renderPage();
    await expandCard();

    await waitFor(() =>
      expect(profileApi.getPersonalHealthProfile).toHaveBeenCalledWith('U-mom'),
    );
    expect(screen.getByText('您沒有查看對話紀錄的權限')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /查看諮詢紀錄/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /幫忙填健康資料/ })).not.toBeInTheDocument();
  });

  it('MEMBER 連健康資料的請求都不發出去', async () => {
    familyState.members = [memberAs('MEMBER')];
    renderPage();
    await expandCard();

    // 沒有權限就不打，不要讓它 403 之後才在畫面上寫「載入失敗」——
    // 那會讓沒權限看起來像系統壞了
    expect(profileApi.getPersonalHealthProfile).not.toHaveBeenCalled();
    expect(screen.getByText('您沒有查看健康狀況的權限')).toBeInTheDocument();
    expect(screen.getByText('您沒有查看對話紀錄的權限')).toBeInTheDocument();
  });

  it('後端沒帶權限欄位時一律當成沒有權限（fail-closed）', async () => {
    familyState.members = [memberAs(null)];
    renderPage();

    expect(screen.getByText('您沒有查看這位家人資料的權限')).toBeInTheDocument();
    await expandCard();
    expect(profileApi.getPersonalHealthProfile).not.toHaveBeenCalled();
  });

  it('沒有任何權限也能移除：切斷關係不看對方給了什麼權限', async () => {
    familyState.members = [memberAs(null)];
    renderPage();
    await expandCard();

    expect(screen.getByRole('button', { name: '移除家人' })).toBeInTheDocument();
  });

  it('影子模式下（後端回滿權限）介面與變更前完全相同', async () => {
    // 遷移狀態只存在後端一處。前端不判斷 shadow／enforced，只照著回來的
    // my_permissions 渲染——所以「未生效」在這裡的樣子，就是收到滿權限的樣子。
    familyState.members = [
      {
        ...memberAs('MEMBER'),
        my_permissions: PERMISSIONS.GUARDIAN,
        rbac_migration_state: 'shadow',
      },
    ];
    renderPage();
    await expandCard();

    await waitFor(() =>
      expect(profileApi.getPersonalHealthProfile).toHaveBeenCalledWith('U-mom'),
    );
    expect(screen.getByRole('button', { name: /查看諮詢紀錄/ })).toBeInTheDocument();
    expect(screen.queryByText(/您沒有查看/)).not.toBeInTheDocument();
  });
});

describe('家人資料頁的健康紀錄區塊（血壓、血糖、步數，Task 11）', () => {
  const BP: HealthMeasurement = {
    id: 'm-bp-1',
    user_id: 'U-mom',
    kind: 'blood_pressure',
    measured_at: '2026-09-16T01:00:00Z',
    recorded_by: 'U-mom',
    systolic: 132,
    diastolic: 84,
    pulse: 70,
    glucose_mg_dl: null,
    meal_context: null,
    level: 'above_range',
    created_at: '2026-09-16T01:00:00Z',
  };
  const GLUCOSE: HealthMeasurement = {
    id: 'm-glucose-1',
    user_id: 'U-mom',
    kind: 'blood_glucose',
    measured_at: '2026-09-16T02:00:00Z',
    recorded_by: 'U-mom',
    systolic: null,
    diastolic: null,
    pulse: null,
    glucose_mg_dl: 98,
    meal_context: 'fasting',
    level: 'within_range',
    created_at: '2026-09-16T02:00:00Z',
  };
  const STEP_COUNTS: StepCount[] = [{ user_id: 'U-mom', date: todayTaipei(), steps: 62 }];

  beforeEach(async () => {
    vi.clearAllMocks();
    familyState.roleAssignment = null;
    familyState.loading = false;
    familyState.error = null;
    vi.mocked(healthApi.fetchMeasurements).mockImplementation(async (_userId, options) =>
      options?.kind === 'blood_pressure' ? [BP] : [GLUCOSE],
    );
    vi.mocked(healthApi.fetchStepCounts).mockResolvedValue(STEP_COUNTS);
    await i18n.changeLanguage('zh-TW');
  });

  it('GUARDIAN（嚴格讀寫皆有）：顯示最新血壓血糖等級與今日步數，也有代記入口', async () => {
    familyState.members = [memberWithStrict('GUARDIAN', 'GUARDIAN')];
    renderPage();
    await expandCard();

    await waitFor(() =>
      expect(healthApi.fetchMeasurements).toHaveBeenCalledWith('U-mom', {
        kind: 'blood_pressure',
      }),
    );
    expect(healthApi.fetchMeasurements).toHaveBeenCalledWith('U-mom', { kind: 'blood_glucose' });
    expect(healthApi.fetchStepCounts).toHaveBeenCalledWith('U-mom');

    expect(await screen.findByText('最近健康紀錄')).toBeInTheDocument();
    expect(screen.getByText('高於範圍')).toBeInTheDocument();
    expect(screen.getByText('正常範圍')).toBeInTheDocument();
    expect(screen.getByText('62 步')).toBeInTheDocument();

    const proxyButton = screen.getByRole('button', { name: /幫他記錄健康紀錄/ });
    fireEvent.click(proxyButton);
    expect(await screen.findByText('health-records-for:U-mom')).toBeInTheDocument();
  });

  it('CAREGIVER（嚴格只有讀取權）：顯示紀錄，但沒有代記入口', async () => {
    familyState.members = [memberWithStrict('CAREGIVER', 'CAREGIVER')];
    renderPage();
    await expandCard();

    await waitFor(() => expect(healthApi.fetchStepCounts).toHaveBeenCalledWith('U-mom'));
    // 讀取權只讀不寫，血壓血糖的查詢仍要照樣打出去——不能只驗證步數，否則
    // 唯讀角色的血壓／血糖查詢壞掉也不會被這條測試抓到（Task 12 review）。
    expect(healthApi.fetchMeasurements).toHaveBeenCalledWith('U-mom', { kind: 'blood_pressure' });
    expect(healthApi.fetchMeasurements).toHaveBeenCalledWith('U-mom', { kind: 'blood_glucose' });
    expect(await screen.findByText('62 步')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /幫他記錄健康紀錄/ })).not.toBeInTheDocument();
  });

  it('沒有今天的步數紀錄時顯示「尚無紀錄」，不會顯示成 0 步（review：步數不能把「沒資料」說成「走了 0 步」）', async () => {
    vi.mocked(healthApi.fetchStepCounts).mockResolvedValue([]);
    familyState.members = [memberWithStrict('GUARDIAN', 'GUARDIAN')];
    renderPage();
    await expandCard();

    await waitFor(() => expect(healthApi.fetchStepCounts).toHaveBeenCalledWith('U-mom'));
    const stepsRow = (await screen.findByText('今日步數')).closest('div');
    expect(stepsRow).not.toBeNull();
    expect(within(stepsRow as HTMLElement).getByText('尚無紀錄')).toBeInTheDocument();
    expect(screen.queryByText(/0 步/)).not.toBeInTheDocument();
  });

  it('MEMBER（嚴格判定皆無）：整段健康紀錄不渲染，連請求都不發', async () => {
    familyState.members = [memberWithStrict('MEMBER', 'MEMBER')];
    renderPage();
    await expandCard();

    expect(healthApi.fetchMeasurements).not.toHaveBeenCalled();
    expect(healthApi.fetchStepCounts).not.toHaveBeenCalled();
    expect(screen.queryByText('最近健康紀錄')).not.toBeInTheDocument();
  });

  it('影子模式：寬鬆權限放寬成 GUARDIAN，但嚴格判定仍是 MEMBER 時，隱藏且不發請求', async () => {
    // 血壓血糖、提醒範圍、步數是 personal-health-tracking 新導入的資源，一律
    // 嚴格判定、不受影子模式放寬（同 familyPermissions.ts 對 canReadHealthRecords
    // 的說明）。這裡刻意讓 my_permissions 是放寬後的 GUARDIAN，my_strict_permissions
    // 卻仍是真正生效中的 MEMBER（皆無），驗證健康紀錄區塊只認後者。
    familyState.members = [
      memberWithStrict('MEMBER', 'MEMBER', {
        my_permissions: PERMISSIONS.GUARDIAN,
        rbac_migration_state: 'shadow',
      }),
    ];
    renderPage();
    await expandCard();

    expect(healthApi.fetchMeasurements).not.toHaveBeenCalled();
    expect(healthApi.fetchStepCounts).not.toHaveBeenCalled();
    expect(screen.queryByText('最近健康紀錄')).not.toBeInTheDocument();
  });
});

describe('引導式角色指派', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue({ age: 68 });
    familyState.members = [memberAs('GUARDIAN')];
    familyState.roleAssignment = null;
    familyState.loading = false;
    familyState.error = null;
    await i18n.changeLanguage('zh-TW');
  });

  it('首頁只用家人格子上的標籤表示權限，不放提示框或「設定家人權限」入口', () => {
    familyState.roleAssignment = assignment({
      rbac_migration_state: 'enforced',
      unassigned_member_ids: ['U-a', 'U-b'],
    });
    renderPage('/personalhealth');

    expect(screen.getByRole('link', { name: /媽媽/ })).toHaveTextContent(/[已未]設定權限/);
    expect(screen.queryByText(/尚未設定權限，目前會以「一般家人」處理/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /設定家人權限/ })).not.toBeInTheDocument();
  });

  it('權限說明改由設定權限頁提供：已生效且有未設定的家人時說還有幾位、以一般家人處理', () => {
    familyState.roleAssignment = assignment({
      rbac_migration_state: 'enforced',
      unassigned_member_ids: ['U-a', 'U-b'],
    });
    renderPage('/family/members/U-mom/role');

    expect(
      screen.getByText('還有 2 位家人尚未設定權限，目前會以「一般家人」處理。'),
    ).toBeInTheDocument();
  });

  it('總閘關閉（全部設定好仍是 shadow）時，設定權限頁直說權限沒有生效', () => {
    familyState.members = [{ ...memberAs('GUARDIAN'), family_role: 'CAREGIVER' }];
    familyState.roleAssignment = assignment({ is_complete: true });
    renderPage('/family/members/U-mom/role');

    expect(
      screen.getByText('權限設定目前沒有生效，所有家人都看得到您的健康狀況與對話紀錄。'),
    ).toBeInTheDocument();
  });

  it('權限已生效且全部設定完：不顯示提示，家人格子仍可進入各自的設定', () => {
    familyState.members = [{ ...memberAs('GUARDIAN'), family_role: 'CAREGIVER' }];
    familyState.roleAssignment = assignment({
      is_complete: true,
      rbac_migration_state: 'enforced',
    });
    renderPage('/personalhealth');

    expect(screen.queryByText(/未設定權限/)).not.toBeInTheDocument();
    expect(screen.queryByText(/沒有生效/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /媽媽/ })).toHaveAttribute('href', '/family/members/U-mom');
  });

  describe('單一家人的設定權限頁', () => {
    it('未設定時不預先選中任何角色、不能儲存；三種角色都附說明與經期提示', async () => {
      familyState.members = [{ ...memberAs('GUARDIAN'), family_role: null }];
      familyState.roleAssignment = assignment({ rbac_migration_state: 'enforced', unassigned_member_ids: ['U-mom'] });
      renderPage('/family/members/U-mom/role');

      for (const name of [/^主要照顧者/, /^協助照顧者/, /^一般家人/]) {
        expect(screen.getByRole('radio', { name })).not.toBeChecked();
      }
      expect(screen.getByText('看得到您的健康狀況與對話紀錄，也能幫您設定用藥與健康資料。')).toBeInTheDocument();
      expect(screen.getByText('經期紀錄僅本人可見。')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '儲存權限設定' })).toBeDisabled();
    });

    it('shadow 時頁首說明實況，角色說明前面標上「權限生效後」', () => {
      familyState.members = [{ ...memberAs('GUARDIAN'), family_role: 'CAREGIVER' }];
      familyState.roleAssignment = assignment({ unassigned_member_ids: ['U-dad'] });
      renderPage('/family/members/U-mom/role');

      expect(screen.getByText(shadowPending(1))).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /^協助照顧者/ })).toBeChecked();
      expect(
        screen.getByText('權限生效後：看得到您的健康狀況，能幫您設定用藥；看不到對話紀錄。'),
      ).toBeInTheDocument();
    });

    it('選好按儲存才送出既有 API，成功後回到家人資料頁', async () => {
      vi.mocked(familyApi.setFamilyRole).mockResolvedValue({
        user_id: 'U-me', family_members: [], created_at: '', updated_at: '',
      });
      familyState.members = [{ ...memberAs('GUARDIAN'), family_role: null }];
      renderPage('/family/members/U-mom/role');

      fireEvent.click(screen.getByRole('radio', { name: /^協助照顧者/ }));
      expect(familyApi.setFamilyRole).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: '儲存權限設定' }));

      await waitFor(() => expect(familyApi.setFamilyRole).toHaveBeenCalledWith('U-mom', 'CAREGIVER'));
      expect(await screen.findByText('已更新 媽媽 的權限')).toBeInTheDocument();
      expect(await screen.findByRole('heading', { name: '家人資料' })).toBeInTheDocument();
    });

    it('儲存失敗時提示錯誤並留在設定頁', async () => {
      vi.mocked(familyApi.setFamilyRole).mockRejectedValue(new Error('權限服務忙碌中'));
      familyState.members = [{ ...memberAs('GUARDIAN'), family_role: 'MEMBER' }];
      renderPage('/family/members/U-mom/role');

      fireEvent.click(screen.getByRole('radio', { name: /^主要照顧者/ }));
      fireEvent.click(screen.getByRole('button', { name: '儲存權限設定' }));

      expect(await screen.findByText('權限服務忙碌中')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: '設定權限' })).toBeInTheDocument();
    });
  });

  describe('查詢紀錄', () => {
    it.each([
      ['GUARDIAN', [['用藥與掛號資訊', '可查看與管理'], ['健康資料與量測', '可查看與管理'], ['看診紀錄與錄音摘要', '可查看與管理'], ['健康諮詢對話', '唯讀']]],
      ['CAREGIVER', [['用藥與掛號資訊', '可查看與管理'], ['健康資料與量測', '唯讀'], ['看診紀錄與錄音摘要', '唯讀']]],
      ['MEMBER', [['用藥與掛號資訊', '唯讀']]],
    ] as const)('%s：依角色列出他能用您的哪些資料，碰不到的類別不列', (role, expected) => {
      familyState.members = [{ ...memberAs('GUARDIAN'), family_role: role }];
      renderPage('/family/members/U-mom/access');

      const rows = screen.getAllByRole('listitem');
      expect(rows.map((row) => row.textContent)).toEqual(expected.map(([label, level]) => `${label}${level}`));
    });

    it('未設定角色時說明要先設定，並可返回成員資料', () => {
      familyState.members = [{ ...memberAs('GUARDIAN'), family_role: null }];
      renderPage('/family/members/U-mom/access');

      expect(screen.getByText('請先設定權限。')).toBeInTheDocument();
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: '返回成員資料' })).toHaveAttribute('href', '/family/members/U-mom');
    });
  });

  describe('全部家人的權限頁（/family/permissions）', () => {
    it('shadow 時頁首也說明，角色說明前面標上「權限生效後」', async () => {
      vi.mocked(familyApi.fetchMemberRoles).mockResolvedValue([
        { user_id: 'U-mom', display_name: '媽媽', family_role: 'CAREGIVER', effective_family_role: 'CAREGIVER' },
        { user_id: 'U-dad', display_name: '爸爸', family_role: null, effective_family_role: 'MEMBER' },
      ]);
      familyState.roleAssignment = assignment({ unassigned_member_ids: ['U-dad'] });
      renderPage('/family/permissions');
      const dialog = document.body;

      expect(within(dialog).getByText(shadowPending(1))).toBeInTheDocument();
      expect(
        await within(dialog).findByText(
          '權限生效後：看得到您的健康狀況，能幫您設定用藥；看不到對話紀錄。',
        ),
      ).toBeInTheDocument();
    });

    it('enforced 時角色說明就是現況，不加前綴', async () => {
      vi.mocked(familyApi.fetchMemberRoles).mockResolvedValue([
        { user_id: 'U-mom', display_name: '媽媽', family_role: 'MEMBER', effective_family_role: 'MEMBER' },
      ]);
      familyState.roleAssignment = assignment({
        is_complete: true,
        rbac_migration_state: 'enforced',
      });
      renderPage('/family/permissions');
      const dialog = document.body;

      expect(
        await within(dialog).findByText('只看得到用藥時間與藥名，看不到健康狀況與對話紀錄。'),
      ).toBeInTheDocument();
      expect(within(dialog).queryByText(/權限生效後/)).not.toBeInTheDocument();
    });

    it('未設定的成員不預先選中任何角色，選了才送出並顯示說明', async () => {
      vi.mocked(familyApi.fetchMemberRoles).mockResolvedValue([
        { user_id: 'U-mom', display_name: '媽媽', family_role: null, effective_family_role: 'MEMBER' },
      ]);
      vi.mocked(familyApi.setFamilyRole).mockResolvedValue({
        user_id: 'U-me',
        family_members: [],
        created_at: '',
        updated_at: '',
      });
      familyState.roleAssignment = assignment({ unassigned_member_ids: ['U-mom'] });
      renderPage('/family/permissions');
      await waitFor(() => expect(screen.getByText('尚未設定')).toBeInTheDocument());

      // 未設定 ≠ 已選「一般家人」。預先選中會讓擁有者以為自己設定過了
      const memberToggle = screen.getByRole('button', { name: '一般家人' });
      expect(memberToggle).toHaveAttribute('aria-pressed', 'false');

      fireEvent.click(screen.getByRole('button', { name: '協助照顧者' }));
      await waitFor(() =>
        expect(familyApi.setFamilyRole).toHaveBeenCalledWith('U-mom', 'CAREGIVER'),
      );
    });

    it('一位家人一頁：只有一位時不畫導覽列', async () => {
      vi.mocked(familyApi.fetchMemberRoles).mockResolvedValue([
        { user_id: 'U-mom', display_name: '媽媽', family_role: 'GUARDIAN' },
      ]);
      renderPage('/family/permissions');
      await waitFor(() => expect(screen.getByText('媽媽')).toBeInTheDocument());

      expect(screen.queryByRole('button', { name: '下一位家人' })).not.toBeInTheDocument();
      expect(screen.queryByText('第 1 位，共 1 位')).not.toBeInTheDocument();
    });

    it('多位家人時用上一位／下一位切換，計數跟著走，兩端按鈕停用', async () => {
      vi.mocked(familyApi.fetchMemberRoles).mockResolvedValue([
        { user_id: 'U-mom', display_name: '媽媽', family_role: 'GUARDIAN' },
        { user_id: 'U-son', display_name: '大兒子', family_role: null },
        { user_id: 'U-dau', display_name: '女兒', family_role: 'MEMBER' },
      ]);
      renderPage('/family/permissions');
      await waitFor(() => expect(screen.getByText('第 1 位，共 3 位')).toBeInTheDocument());

      const prev = screen.getByRole('button', { name: '上一位家人' });
      const next = screen.getByRole('button', { name: '下一位家人' });
      expect(prev).toBeDisabled();
      expect(next).toBeEnabled();

      fireEvent.click(next);
      expect(screen.getByText('第 2 位，共 3 位')).toBeInTheDocument();
      expect(prev).toBeEnabled();

      fireEvent.click(next);
      expect(screen.getByText('第 3 位，共 3 位')).toBeInTheDocument();
      expect(next).toBeDisabled();

      fireEvent.click(prev);
      expect(screen.getByText('第 2 位，共 3 位')).toBeInTheDocument();

      // 每位家人的角色群組各自以名字標示，按到的一定是眼前這位的
      const sonGroup = screen.getByRole('group', { name: '大兒子 的權限' });
      expect(sonGroup).toBeInTheDocument();
    });

    it('平滑捲動途中的 scroll 事件不會把計數推回舊頁，捲到之後照常跟著手指走', async () => {
      vi.mocked(familyApi.fetchMemberRoles).mockResolvedValue([
        { user_id: 'U-mom', display_name: '媽媽', family_role: 'GUARDIAN' },
        { user_id: 'U-son', display_name: '大兒子', family_role: null },
        { user_id: 'U-dau', display_name: '女兒', family_role: 'MEMBER' },
      ]);
      renderPage('/family/permissions');
      await waitFor(() => expect(screen.getByText('第 1 位，共 3 位')).toBeInTheDocument());

      // jsdom 沒有排版，clientWidth 預設 0；給它一個寬度才能模擬捲動位置
      const track = screen.getByRole('group', { name: '家人的權限' });
      Object.defineProperty(track, 'clientWidth', { configurable: true, value: 300 });

      fireEvent.click(screen.getByRole('button', { name: '下一位家人' }));
      expect(screen.getByText('第 2 位，共 3 位')).toBeInTheDocument();

      // 平滑捲動剛開始：位置還在第 1 頁附近，四捨五入回推會得到第 1 頁。
      // 這是先前會讓計數與按鈕閃一下的來源，現在要被擋掉。
      Object.defineProperty(track, 'scrollLeft', { configurable: true, value: 12 });
      fireEvent.scroll(track);
      expect(screen.getByText('第 2 位，共 3 位')).toBeInTheDocument();

      // 捲到目的地之後，手指自己滑到第 3 頁仍然要更新計數
      Object.defineProperty(track, 'scrollLeft', { configurable: true, value: 300 });
      fireEvent.scroll(track);
      expect(screen.getByText('第 2 位，共 3 位')).toBeInTheDocument();

      Object.defineProperty(track, 'scrollLeft', { configurable: true, value: 600 });
      fireEvent.scroll(track);
      expect(screen.getByText('第 3 位，共 3 位')).toBeInTheDocument();
    });
  });
});

// 後端在擁有者替最後一位家人指派角色時自動切成 enforced。前端要做的只有一件事：
// 指派成功後讓 familyTree 失效，重抓回來的 role_assignment 自然會換掉提示。
// 這條路徑要用真的 useFamily 才走得到。
describe('指派完最後一位家人後，提示跟著後端的狀態走', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    familyMode.real = true;
    await i18n.changeLanguage('zh-TW');
  });

  afterEach(() => {
    familyMode.real = false;
  });

  it('後端切成 enforced 後，設定頁的提示消失，角色說明拿掉「生效後」', async () => {
    let assigned = false;
    const tree = (): GetFamilyTreeResponse => ({
      family_tree: {
        user_id: 'U-me',
        family_members: [{ ...memberAs('GUARDIAN'), family_role: assigned ? 'CAREGIVER' : null }],
        created_at: '',
        updated_at: '',
      },
      role_assignment: assigned
        ? assignment({ is_complete: true, rbac_migration_state: 'enforced' })
        : assignment({ unassigned_member_ids: ['U-mom'] }),
    });
    const roles = (): FamilyRoleEntry[] => [
      {
        user_id: 'U-mom',
        display_name: '媽媽',
        family_role: assigned ? 'CAREGIVER' : null,
        effective_family_role: assigned ? 'CAREGIVER' : 'MEMBER',
      },
    ];
    vi.mocked(familyApi.fetchFamilyTree).mockImplementation(async () => tree());
    vi.mocked(familyApi.fetchMemberRoles).mockImplementation(async () => roles());
    vi.mocked(familyApi.setFamilyRole).mockImplementation(async () => {
      assigned = true;
      return tree().family_tree;
    });

    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue(null);
    renderPage('/family/members/U-mom/role');
    expect(await screen.findByText(shadowPending(1))).toBeInTheDocument();
    expect(screen.getAllByText(/權限生效後/).length).toBe(3);

    fireEvent.click(screen.getByRole('radio', { name: /^協助照顧者/ }));
    fireEvent.click(screen.getByRole('button', { name: '儲存權限設定' }));

    // 回到家人資料頁時族譜已重抓：角色換成新的，查詢紀錄與提醒說明出現
    expect(await screen.findByRole('link', { name: /查詢紀錄/ })).toBeInTheDocument();
    expect(screen.getByText('已設定權限')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('link', { name: '設定權限' })[0]);
    expect(await screen.findByRole('radio', { name: /^協助照顧者/ })).toBeChecked();
    expect(screen.queryByText(shadowPending(1))).not.toBeInTheDocument();
    expect(screen.queryByText(/權限生效後/)).not.toBeInTheDocument();
    expect(screen.queryByText(/目前會以「一般家人」處理/)).not.toBeInTheDocument();
  });
});

describe('設定稱謂後，族譜畫面直接更新', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    familyMode.real = true;
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue(null);
    await i18n.changeLanguage('zh-TW');
  });

  afterEach(() => {
    familyMode.real = false;
  });

  it('relationship_type 原本是 null 時不假設關係；儲存後不用重新整理就顯示新稱謂', async () => {
    let relationship: FamilyMember['relationship_type'] = null;
    const tree = (): GetFamilyTreeResponse => ({
      family_tree: {
        user_id: 'U-me',
        family_members: [
          memberWithStrict('MEMBER', 'MEMBER', {
            display_name: '兒子',
            relationship_type: relationship,
          }),
        ],
        created_at: '',
        updated_at: '',
      },
      role_assignment: null,
    });
    vi.mocked(familyApi.fetchFamilyTree).mockImplementation(async () => tree());
    vi.mocked(familyApi.setRelationship).mockImplementation(async (_memberId, next) => {
      relationship = next;
      return tree().family_tree;
    });

    renderPage();

    expect(await screen.findByText('尚未設定稱謂')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '設定稱謂' }));
    const dialog = await screen.findByRole('dialog', { name: '設定稱謂' });
    fireEvent.click(within(dialog).getByRole('button', { name: '子/女' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存' }));

    await waitFor(() =>
      expect(familyApi.setRelationship).toHaveBeenCalledWith('U-mom', 'child'),
    );
    expect(await screen.findByText('已更新 兒子 的稱謂')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('子/女')).toBeInTheDocument();
    expect(screen.queryByText('尚未設定稱謂')).not.toBeInTheDocument();
  });
});

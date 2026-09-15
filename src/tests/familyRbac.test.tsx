import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithToaster } from './testUtils';
import FamilyPage from '../pages/Family';
import * as profileApi from '../api/profileApi';
import * as familyApi from '../api/familyApi';
import type {
  FamilyMember,
  FamilyPermissions,
  FamilyRole,
  FamilyRoleAssignmentStatus,
  FamilyRoleEntry,
  GetFamilyTreeResponse,
} from '../types/family';
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

function renderPage() {
  return renderWithToaster(
    <MemoryRouter initialEntries={['/family']}>
      <Routes>
        <Route path="/family" element={<FamilyPage />} />
        <Route path="/personalhealth/consult" element={<div>consult</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function expandCard() {
  fireEvent.click(screen.getByRole('button', { name: '媽媽' }));
  // 展開是 Collapsible，內容要等一次 render
  await waitFor(() => expect(screen.getByText('健康狀況')).toBeInTheDocument());
}

describe('家人卡片依角色降級', () => {
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
    expect(screen.getByRole('button', { name: /幫他填健康資料/ })).toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: /幫他填健康資料/ })).not.toBeInTheDocument();
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

    // 卡片收合時就要講清楚這位家人的資料看不到，不必先展開才發現一片空白
    expect(screen.getByText('您沒有查看這位家人資料的權限')).toBeInTheDocument();
    await expandCard();
    expect(profileApi.getPersonalHealthProfile).not.toHaveBeenCalled();
  });

  it('沒有任何權限也能移除：切斷關係不看對方給了什麼權限', async () => {
    familyState.members = [memberAs(null)];
    renderPage();
    await expandCard();

    expect(screen.getByRole('button', { name: /移除這位家人/ })).toBeInTheDocument();
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

  it('權限已生效（enforced）且有未設定的家人：說還有幾位、現在以一般家人處理', () => {
    familyState.roleAssignment = assignment({
      rbac_migration_state: 'enforced',
      unassigned_member_ids: ['U-a', 'U-b'],
    });
    renderPage();

    expect(
      screen.getByText('還有 2 位家人尚未設定權限，目前會以「一般家人」處理。'),
    ).toBeInTheDocument();
  });

  it('還沒生效（shadow）且有人沒設定：講明在那之前所有家人都看得到，不說「以一般家人處理」', () => {
    familyState.roleAssignment = assignment({ unassigned_member_ids: ['U-a', 'U-b'] });
    renderPage();

    expect(screen.getByText(shadowPending(2))).toBeInTheDocument();
    // 舊文案在 shadow 時是謊話：角色沒有作用，未設定的人並不是以一般家人處理
    expect(screen.queryByText(/目前會以「一般家人」處理/)).not.toBeInTheDocument();
  });

  it('都設定好了卻還是 shadow（總閘關閉）：直說權限沒有生效', () => {
    // 「都設定好了」代表卡片上的家人也有角色，否則卡片會顯示「尚未設定權限」
    familyState.members = [{ ...memberAs('GUARDIAN'), family_role: 'CAREGIVER' }];
    familyState.roleAssignment = assignment({ is_complete: true });
    renderPage();

    expect(
      screen.getByText('權限設定目前沒有生效，所有家人都看得到您的健康狀況與對話紀錄。'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/尚未設定權限/)).not.toBeInTheDocument();
  });

  it('權限已生效且全部設定完：不顯示提示，但入口仍在', () => {
    familyState.members = [{ ...memberAs('GUARDIAN'), family_role: 'CAREGIVER' }];
    familyState.roleAssignment = assignment({
      is_complete: true,
      rbac_migration_state: 'enforced',
    });
    renderPage();

    expect(screen.queryByText(/尚未設定權限/)).not.toBeInTheDocument();
    expect(screen.queryByText(/沒有生效/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /設定家人權限/ })).toBeInTheDocument();
  });

  it('shadow 時對話框頂端也說明，角色說明前面標上「權限生效後」', async () => {
    vi.mocked(familyApi.fetchMemberRoles).mockResolvedValue([
      { user_id: 'U-mom', display_name: '媽媽', family_role: 'CAREGIVER', effective_family_role: 'CAREGIVER' },
      { user_id: 'U-dad', display_name: '爸爸', family_role: null, effective_family_role: 'MEMBER' },
    ]);
    familyState.roleAssignment = assignment({ unassigned_member_ids: ['U-dad'] });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /設定家人權限/ }));
    const dialog = await screen.findByRole('dialog');

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
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /設定家人權限/ }));
    const dialog = await screen.findByRole('dialog');

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
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /設定家人權限/ }));
    await waitFor(() => expect(screen.getByText('尚未設定')).toBeInTheDocument());

    // 未設定 ≠ 已選「一般家人」。預先選中會讓擁有者以為自己設定過了
    const memberToggle = screen.getByRole('button', { name: '一般家人' });
    expect(memberToggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: '協助照顧者' }));
    await waitFor(() =>
      expect(familyApi.setFamilyRole).toHaveBeenCalledWith('U-mom', 'CAREGIVER'),
    );
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

  it('後端切成 enforced 後，族譜頁與對話框的提示都消失，角色說明拿掉「生效後」', async () => {
    let assigned = false;
    const tree = (): GetFamilyTreeResponse => ({
      family_tree: {
        user_id: 'U-me',
        family_members: [memberAs('GUARDIAN')],
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

    renderPage();
    expect(await screen.findByText(shadowPending(1))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /設定家人權限/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(shadowPending(1))).toBeInTheDocument();

    fireEvent.click(await within(dialog).findByRole('button', { name: '協助照顧者' }));

    await waitFor(() => expect(screen.queryByText(shadowPending(1))).not.toBeInTheDocument());
    expect(
      await within(dialog).findByText('看得到您的健康狀況，能幫您設定用藥；看不到對話紀錄。'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/權限生效後/)).not.toBeInTheDocument();
    expect(screen.queryByText(/目前會以「一般家人」處理/)).not.toBeInTheDocument();
  });
});

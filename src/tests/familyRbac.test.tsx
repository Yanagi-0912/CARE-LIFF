import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithToaster } from './testUtils';
import FamilyPage from '../pages/Family';
import * as profileApi from '../api/profileApi';
import * as familyApi from '../api/familyApi';
import type { FamilyMember, FamilyPermissions, FamilyRole } from '../types/family';
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
}));

vi.mock('../hooks/useLiff', () => ({
  useLiff: () => ({ liffReady: true }),
}));

vi.mock('@line/liff', () => ({
  default: { isApiAvailable: () => false, shareTargetPicker: vi.fn() },
}));

const familyState = {
  members: [] as FamilyMember[],
  roleAssignment: null as { complete: boolean; unassigned_member_ids: string[] } | null,
  loading: false,
  error: null as string | null,
  refetch: vi.fn(),
};

vi.mock('../hooks/useFamily', () => ({
  useFamily: () => familyState,
}));

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

  it('有未設定的家人時，族譜頁直接說還有幾位以及現在算什麼權限', () => {
    familyState.roleAssignment = { complete: false, unassigned_member_ids: ['U-a', 'U-b'] };
    renderPage();

    expect(
      screen.getByText('還有 2 位家人尚未設定權限，目前會以「一般家人」處理。'),
    ).toBeInTheDocument();
  });

  it('全部設定完就不再顯示提示，但入口仍在', () => {
    familyState.roleAssignment = { complete: true, unassigned_member_ids: [] };
    renderPage();

    expect(screen.queryByText(/尚未設定權限/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /設定家人權限/ })).toBeInTheDocument();
  });

  it('未設定的成員不預先選中任何角色，選了才送出並顯示說明', async () => {
    vi.mocked(familyApi.fetchMemberRoles).mockResolvedValue([
      { user_id: 'U-mom', display_name: '媽媽', family_role: null },
    ]);
    vi.mocked(familyApi.setFamilyRole).mockResolvedValue(undefined);
    familyState.roleAssignment = { complete: false, unassigned_member_ids: ['U-mom'] };
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

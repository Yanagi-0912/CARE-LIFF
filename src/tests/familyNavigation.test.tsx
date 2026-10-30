import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithToaster } from './testUtils';
import FamilyPage from '../pages/Family';
import * as familyApi from '../api/familyApi';
import type { FamilyMember, GetFamilyTreeResponse } from '../types/family';
import i18n from '../i18n';

vi.mock('../api/familyApi', () => ({
  fetchFamilyTree: vi.fn(),
  fetchMemberRoles: vi.fn(),
  setFamilyRole: vi.fn(),
  createInvite: vi.fn(),
}));
vi.mock('../hooks/useLiff', () => ({ useLiff: () => ({ liffReady: true }) }));
vi.mock('@line/liff', () => ({
  default: { isApiAvailable: () => false, shareTargetPicker: vi.fn() },
}));

const member: FamilyMember = {
  user_id: 'U-family+one&two',
  display_name: '林阿嬤',
  relationship_type: 'parent',
  family_role: null,
  my_permissions: { general: [], sensitive: [], private: [] },
};

function tree(members: FamilyMember[] = [member]): GetFamilyTreeResponse {
  return {
    family_tree: { user_id: 'U-me', family_members: members, created_at: '', updated_at: '' },
    role_assignment: {
      owner_id: 'U-me',
      is_complete: false,
      unassigned_member_ids: members.map((entry) => entry.user_id),
      rbac_migration_state: 'shadow',
    },
  };
}

function WatchProbe() {
  const [params] = useSearchParams();
  return <p data-testid="selected-family-member">{params.get('user')}</p>;
}

function renderPage(path = '/family') {
  return renderWithToaster(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/family/*" element={<FamilyPage />} />
        <Route path="/lost/watch" element={<WatchProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('家庭分類導覽', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('zh-TW');
    vi.mocked(familyApi.fetchFamilyTree).mockResolvedValue(tree());
    vi.mocked(familyApi.fetchMemberRoles).mockResolvedValue([
      { user_id: member.user_id, display_name: member.display_name, family_role: null, effective_family_role: 'MEMBER' },
    ]);
  });

  it('首頁的三個入口可分別到成員、權限與位置，成員頁仍可邀請家人', async () => {
    renderPage();
    const members = screen.getByRole('link', { name: new RegExp(i18n.t('familyNavigation.members')) });
    expect(members).toHaveAttribute('href', '/family/members');
    expect(screen.getByRole('link', { name: new RegExp(i18n.t('familyNavigation.permissions')) })).toHaveAttribute('href', '/family/permissions');
    expect(screen.getByRole('link', { name: new RegExp(i18n.t('familyNavigation.location')) })).toHaveAttribute('href', '/family/location');
    fireEvent.click(members);
    expect(await screen.findByRole('button', { name: member.display_name })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /加入家人/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: i18n.t('personalHealth.return') }));
    expect(screen.getByRole('link', { name: new RegExp(i18n.t('familyNavigation.location')) })).toBeInTheDocument();
  });

  it('未知家庭網址回到分類首頁', () => {
    renderPage('/family/unknown');
    expect(screen.getByRole('link', { name: new RegExp(i18n.t('familyNavigation.members')) })).toHaveAttribute('href', '/family/members');
  });

  it('直接開啟權限頁就能指派角色，送出既有 API 並更新角色狀態', async () => {
    vi.mocked(familyApi.setFamilyRole).mockImplementation(async (userId, role) => {
      vi.mocked(familyApi.fetchMemberRoles).mockResolvedValue([
        { user_id: userId, display_name: member.display_name, family_role: role, effective_family_role: role },
      ]);
      return tree([{ ...member, family_role: role }]).family_tree;
    });
    renderPage('/family/permissions');
    const guardian = await screen.findByRole('button', { name: '主要照顧者' });
    expect(guardian).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/全部設定好之前，所有家人都看得到/)).toBeInTheDocument();
    fireEvent.click(guardian);
    await waitFor(() => expect(guardian).toHaveAttribute('aria-pressed', 'true'));
    expect(familyApi.setFamilyRole).toHaveBeenCalledWith('U-family+one&two', 'GUARDIAN');
    expect(await screen.findByText('已更新 林阿嬤 的權限')).toBeInTheDocument();
  });

  it('角色資料載入失敗時保留明確錯誤提示', async () => {
    vi.mocked(familyApi.fetchMemberRoles).mockRejectedValue(new Error('roles unavailable'));
    renderPage('/family/permissions');
    expect(await screen.findByText(i18n.t('familyRole.manage.loadError'))).toBeInTheDocument();
  });

  it('位置成員選擇正確編碼 ID，健康權限為空也不代替通報收件人的判定', async () => {
    renderPage('/family/location');
    fireEvent.click(await screen.findByRole('link', { name: new RegExp(member.display_name!) }));
    expect(screen.getByTestId('selected-family-member')).toHaveTextContent('U-family+one&two');
  });

  it.each(['/family/permissions', '/family/location'])('%s 無家人時可前往成員頁邀請', async (path) => {
    vi.mocked(familyApi.fetchFamilyTree).mockResolvedValue(tree([]));
    renderPage(path);
    expect(await screen.findByText('還沒有家庭成員')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: i18n.t('familyNavigation.members') }));
    expect(await screen.findByRole('button', { name: /加入家人/ })).toBeInTheDocument();
  });

  it.each(['/family/permissions', '/family/location'])('%s 族譜失敗時可重試恢復', async (path) => {
    vi.mocked(familyApi.fetchFamilyTree).mockRejectedValueOnce(new Error('家庭資料暫時無法使用'));
    renderPage(path);
    expect(await screen.findByText('家庭資料暫時無法使用')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新載入' }));
    if (path.endsWith('permissions')) {
      expect(await screen.findByRole('button', { name: '主要照顧者' })).toBeInTheDocument();
    } else {
      expect(await screen.findByRole('link', { name: new RegExp(member.display_name!) })).toBeInTheDocument();
    }
  });

  it('角色更新失敗時保留原本設定與可重試的選項', async () => {
    vi.mocked(familyApi.setFamilyRole).mockRejectedValue(new Error('權限服務忙碌中'));
    renderPage('/family/permissions');
    const roles = await screen.findByRole('group', { name: '林阿嬤 的權限' });
    fireEvent.click(within(roles).getByRole('button', { name: '主要照顧者' }));
    expect(await screen.findByText('權限服務忙碌中')).toBeInTheDocument();
    expect(within(roles).getByRole('button', { name: '主要照顧者' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(roles).getByRole('button', { name: '主要照顧者' })).toBeEnabled();
  });
});

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithToaster } from './testUtils';
import FamilyPage from '../pages/Family';
import * as profileApi from '../api/profileApi';
import * as familyApi from '../api/familyApi';
import type { FamilyMember } from '../types/family';
import { queryKeys } from '@/lib/queryClient';
import i18n from '../i18n';

vi.mock('../api/profileApi', () => ({
  getPersonalHealthProfile: vi.fn(),
}));

vi.mock('../api/familyApi', () => ({
  createInvite: vi.fn(),
  fetchFamilyTree: vi.fn(),
  removeFamilyMember: vi.fn(),
  setRelationship: vi.fn(),
}));

vi.mock('../hooks/useLiff', () => ({
  useLiff: () => ({ liffReady: true }),
}));

// 測試環境不是 LINE webview，把 shareTargetPicker 標成不可用，
// 讓邀請流程穩定走進「請在 LINE 內開啟」那條分支
vi.mock('@line/liff', () => ({
  default: {
    isApiAvailable: () => false,
    shareTargetPicker: vi.fn(),
  },
}));

const familyState = {
  members: [] as FamilyMember[],
  roleAssignment: null,
  loading: false,
  error: null as string | null,
  refetch: vi.fn(),
};

vi.mock('../hooks/useFamily', () => ({
  useFamily: () => familyState,
}));

/** 全部權限：對應後端在影子模式或 GUARDIAN 角色下回的值。
 *
 * 這個欄位不能省。`familyPermissions` 是 fail-closed 的——後端沒帶
 * `my_permissions` 時一律視為沒有權限，因此少了它整張卡片會只剩名字。
 * 方向是刻意的：漏欄位時寧可少顯示（看得出來、報得出來），也不要顯示一堆
 * 按下去必定 403 的入口。 */
const fullPermissions = {
  general: ['READ', 'WRITE'] as const,
  sensitive: ['READ', 'WRITE'] as const,
  private: ['READ'] as const,
};

const mom: FamilyMember = {
  user_id: 'U-mom',
  relationship_type: 'parent',
  display_name: '媽媽',
  my_role: 'GUARDIAN',
  my_permissions: {
    general: [...fullPermissions.general],
    sensitive: [...fullPermissions.sensitive],
    private: [...fullPermissions.private],
  },
};

/** 諮詢頁的替身：只把網址上的查看對象印出來，用來驗證導向的目標 */
function ConsultProbe() {
  const [params] = useSearchParams();
  return <div data-testid="consult-probe">{params.get('user')}</div>;
}

/**
 * 成員卡片的「查看諮詢紀錄」用 useNavigate，必須有 Router context。
 * 掛真的 Routes 而非 mock useNavigate：這樣連查詢字串有沒有正確帶上都驗得到。
 */
function renderPage() {
  return renderWithToaster(
    <MemoryRouter initialEntries={['/family']}>
      <Routes>
        <Route path="/family" element={<FamilyPage />} />
        <Route path="/personalhealth/consult" element={<ConsultProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FamilyPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    familyState.members = [mom];
    familyState.loading = false;
    familyState.error = null;
    await i18n.changeLanguage('zh-TW');
  });

  it('有成員時列出成員與稱謂，並顯示人數', () => {
    renderPage();

    expect(screen.getByText('媽媽')).toBeInTheDocument();
    expect(screen.getByText('父/母')).toBeInTheDocument();
    expect(screen.getByText('共 1 位家人')).toBeInTheDocument();
  });

  it('卡片顯示角色；沒設稱謂時顯示可設定狀態，沒設角色時講明是權限未設定', () => {
    familyState.members = [
      { ...mom, family_role: 'CAREGIVER' },
      { ...mom, user_id: 'U-son', display_name: '兒子', relationship_type: null, family_role: null },
    ];
    renderPage();

    const [momCard, sonCard] = screen.getAllByRole('listitem');
    expect(within(momCard).getByText('協助照顧者')).toBeInTheDocument();
    expect(within(momCard).getByText('父/母')).toBeInTheDocument();
    // 稱謂未設定要講出可設定的狀態，不能假設任何關係。
    expect(within(sonCard).getByText('尚未設定稱謂')).toBeInTheDocument();
    expect(within(sonCard).getByText('尚未設定權限')).toBeInTheDocument();
  });

  describe('設定稱謂', () => {
    beforeEach(() => {
      vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue(null);
    });

    async function openRelationshipDialog(member: FamilyMember = mom) {
      familyState.members = [member];
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: member.display_name ?? '媽媽' }));
      fireEvent.click(await screen.findByRole('button', { name: '設定稱謂' }));
      return screen.findByRole('dialog', { name: '設定稱謂' });
    }

    it('與權限設定分開，未設定時不預設任何關係，並列出七種稱謂', async () => {
      const dialog = await openRelationshipDialog({
        ...mom,
        relationship_type: null,
        display_name: '兒子',
      });

      expect(within(dialog).getByText('尚未設定稱謂')).toBeInTheDocument();
      const relationshipQuestion = '請問 兒子 是您的哪位家人？';
      expect(within(dialog).getByText(relationshipQuestion)).toBeInTheDocument();
      expect(within(dialog).getByRole('group', { name: relationshipQuestion })).toBeInTheDocument();
      for (const label of ['父/母', '子/女', '配偶', '兄弟姊妹', '祖父母', '孫子女', '其他']) {
        expect(within(dialog).getByRole('button', { name: label })).toHaveAttribute(
          'aria-pressed',
          'false',
        );
      }
      expect(within(dialog).getByRole('button', { name: '儲存' })).toBeDisabled();
    });

    it('頁面上「設定稱謂」與「設定家人權限」是兩個獨立入口', async () => {
      familyState.members = [{ ...mom, relationship_type: null }];
      renderPage();

      expect(screen.getByRole('button', { name: /設定家人權限/ })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '媽媽' }));
      expect(await screen.findByRole('button', { name: '設定稱謂' })).toBeInTheDocument();
    });

    it('儲存稱謂時呼叫 setRelationship，送出中顯示載入狀態，成功後更新快取並提示', async () => {
      let finishSave!: (value: { user_id: string; family_members: FamilyMember[]; created_at: string; updated_at: string }) => void;
      vi.mocked(familyApi.setRelationship).mockReturnValue(
        new Promise((resolve) => {
          finishSave = resolve;
        }),
      );
      const setQueryData = vi.spyOn(QueryClient.prototype, 'setQueryData');
      const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries');

      const dialog = await openRelationshipDialog({ ...mom, relationship_type: null });
      const spouse = within(dialog).getByRole('button', { name: '配偶' });
      fireEvent.click(spouse);
      await waitFor(() => expect(spouse).toHaveAttribute('aria-pressed', 'true'));
      const save = within(dialog).getByRole('button', { name: '儲存' });
      await waitFor(() => expect(save).toBeEnabled());
      fireEvent.click(save);

      await waitFor(() =>
        expect(familyApi.setRelationship).toHaveBeenCalledWith('U-mom', 'spouse'),
      );
      expect(await within(dialog).findByRole('button', { name: '儲存中…' })).toBeDisabled();

      await act(async () => {
        finishSave({
          user_id: 'U-me',
          family_members: [{ ...mom, relationship_type: 'spouse' }],
          created_at: '',
          updated_at: '',
        });
      });

      expect(await screen.findByText('已更新 媽媽 的稱謂')).toBeInTheDocument();
      expect(setQueryData).toHaveBeenCalledWith(queryKeys.familyTree, expect.any(Function));
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.familyTree });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      setQueryData.mockRestore();
      invalidate.mockRestore();
    });

    it('稱謂更新失敗時提示錯誤並留在 dialog', async () => {
      vi.mocked(familyApi.setRelationship).mockRejectedValue(new Error('稱謂服務忙碌中'));

      const dialog = await openRelationshipDialog({ ...mom, relationship_type: null });
      fireEvent.click(within(dialog).getByRole('button', { name: '子/女' }));
      fireEvent.click(within(dialog).getByRole('button', { name: '儲存' }));

      expect(await screen.findByText('稱謂服務忙碌中')).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: '設定稱謂' })).toBeInTheDocument();
    });
  });

  it('沒有成員時顯示空狀態，邀請按鈕就在空狀態卡片裡', () => {
    familyState.members = [];
    renderPage();

    expect(screen.getByText('還沒有家庭成員')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /加入家人/ })).toBeInTheDocument();
  });

  it('載入失敗時顯示錯誤訊息與重新載入按鈕', () => {
    familyState.members = [];
    familyState.error = '載入族譜失敗';
    renderPage();

    expect(screen.getByText('載入失敗')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新載入' }));
    expect(familyState.refetch).toHaveBeenCalled();
  });

  it('收合時不打健康資料 API，展開後才載入並列出有填的欄位', async () => {
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue({
      age: 68,
      // 後端在沒填時回的佔位值，不該顯示成一列
      height: 1.0,
      weight: 1.0,
      gender: 'male',
      chronic_diseases: ['hypertension'],
      chronic_custom: ['痛風'],
    });

    renderPage();
    expect(profileApi.getPersonalHealthProfile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '媽媽' }));

    await waitFor(() => {
      expect(screen.getByText('68 歲')).toBeInTheDocument();
    });
    expect(profileApi.getPersonalHealthProfile).toHaveBeenCalledWith('U-mom');
    expect(screen.getByText('男')).toBeInTheDocument();
    // 固定選項翻成中文，自訂病名原文照用
    expect(screen.getByText('高血壓、痛風')).toBeInTheDocument();
    expect(screen.queryByText(/1 cm/)).not.toBeInTheDocument();
  });

  // 新版後端沒填就回 null；舊資料還留著建帳號時的佔位值。兩種都要當成沒填，
  // 而且判斷與表單共用同一份定義（profileToFormValues），不會一邊濾掉一邊沒濾。
  it.each([
    ['舊資料的佔位值', { name: '', gender: 'unknown', age: 0, height: 1, weight: 1 }],
    ['新版後端的 null', { name: '', gender: 'unknown', age: null, height: null, weight: null }],
  ])('%s 整組都當成沒填，顯示尚無資料', async (_label, profile) => {
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue(profile);

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '媽媽' }));

    expect(await screen.findByText('這位家人還沒有填寫健康資料')).toBeInTheDocument();
    expect(screen.queryByText(/0 歲/)).not.toBeInTheDocument();
  });

  it('數值欄位是 null 時只列出有填的欄位', async () => {
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue({
      gender: 'female',
      age: null,
      height: null,
      weight: 52.5,
    });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '媽媽' }));

    expect(await screen.findByText('52.5 kg')).toBeInTheDocument();
    expect(screen.getByText('女')).toBeInTheDocument();
    expect(screen.queryByText(/歲/)).not.toBeInTheDocument();
    expect(screen.queryByText(/cm/)).not.toBeInTheDocument();
  });

  // 這個測試就是這整件事的起點：家庭頁把後端的儲存值原樣印出來，
  // 於是泰文使用者看家人的性別與慢性病看到的全是中文。
  it('切換語言後，家人的性別與固定選項慢性病要跟著翻譯', async () => {
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue({
      gender: 'female',
      chronic_diseases: ['hypertension', 'diabetes'],
      chronic_custom: ['痛風'],
    });

    await i18n.changeLanguage('en');
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '媽媽' }));

    await waitFor(() => {
      expect(screen.getByText('Female')).toBeInTheDocument();
    });
    // 連接符也跟著語言走，英文用逗號而不是頓號
    expect(screen.getByText('Hypertension, Diabetes, 痛風')).toBeInTheDocument();
    // 自訂病名是使用者自己打的字，任何語言下都不該被翻譯或消失
    expect(screen.queryByText(/personalHealth\./)).not.toBeInTheDocument();

    // 已經 render 過了，換語言會觸發重繪，要包在 act 裡
    await act(async () => {
      await i18n.changeLanguage('th');
    });
    expect(screen.getByText('หญิง')).toBeInTheDocument();
    expect(screen.getByText('ความดันโลหิตสูง, เบาหวาน, 痛風')).toBeInTheDocument();

    await act(async () => {
      await i18n.changeLanguage('zh-TW');
    });
  });

  it('健康資料整組是空的時候顯示提示，而不是空白區塊', async () => {
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue(null);

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '媽媽' }));

    await waitFor(() => {
      expect(screen.getByText('這位家人還沒有填寫健康資料')).toBeInTheDocument();
    });
  });

  // ── 邀請 dialog ────────────────────────────────────────────────────────
  //
  // 「加入家人」不再直接開 shareTargetPicker，而是先開 dialog：
  // shareTargetPicker 只列得出 LINE 好友與群組，當面要給非好友掃的 QR 沒有
  // 地方可放。以下幾個測試守的就是「不在 LINE 裡也仍然有路可走」。

  const inviteResponse = {
    invite_token: 'tok',
    expires_at: '2026-12-31T00:00:00.000Z',
    invite_url: 'https://liff.line.me/1234-abcd/join?code=tok',
    qr_url: 'https://care.example.com/api/family/invites/tok/qr.png',
  };

  async function openInviteDialog() {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /加入家人/ }));
    return screen.findByRole('img', { name: '邀請家人' });
  }

  it('按下加入家人會開 dialog，顯示 QR 與可複製的邀請連結', async () => {
    vi.mocked(familyApi.createInvite).mockResolvedValue(inviteResponse);

    const qr = await openInviteDialog();

    expect(qr).toHaveAttribute('src', inviteResponse.qr_url);
    // 連結要與 QR 指向同一處，否則兩條路會把人帶到不同地方。
    expect(screen.getByLabelText('邀請連結')).toHaveValue(inviteResponse.invite_url);
    // 一次性這件事一定要講出來，否則邀請人會以為連結和 QR 是兩個名額。
    expect(
      screen.getByText('這張邀請只能一位家人使用，對方加入後就會失效。'),
    ).toBeInTheDocument();
  });

  it('開一次 dialog 只建立一張邀請', async () => {
    // StrictMode 會把 effect 跑兩次。少了元件裡那道閘，每開一次就留下一筆
    // 永遠不會被用掉的邀請。
    vi.mocked(familyApi.createInvite).mockResolvedValue(inviteResponse);

    await openInviteDialog();

    expect(familyApi.createInvite).toHaveBeenCalledTimes(1);
  });

  it('不在 LINE 內時，錯誤只在按下分享時出現，QR 與連結仍然可用', async () => {
    vi.mocked(familyApi.createInvite).mockResolvedValue(inviteResponse);

    await openInviteDialog();
    // 光是開啟 dialog 不該報錯——QR 與複製連結都不需要 LIFF。
    expect(
      screen.queryByText('請在 LINE App 內開啟後再分享邀請連結'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /分享到 LINE/ }));

    await waitFor(() => {
      expect(
        screen.getByText('請在 LINE App 內開啟後再分享邀請連結'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('邀請已送出')).not.toBeInTheDocument();
    // 報錯之後 QR 還在，使用者仍然可以改用當面掃。
    expect(screen.getByRole('img', { name: '邀請家人' })).toBeInTheDocument();
  });

  it('後端組不出 QR 網址時說明原因，而不是留一張破圖', async () => {
    vi.mocked(familyApi.createInvite).mockResolvedValue({
      ...inviteResponse,
      qr_url: null,
    });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /加入家人/ }));

    expect(
      await screen.findByText('目前無法顯示 QR code，請改用下方連結分享。'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: '邀請家人' })).not.toBeInTheDocument();
    // 連結那條路不受影響。
    expect(screen.getByLabelText('邀請連結')).toHaveValue(inviteResponse.invite_url);
  });

  it('後端未設定 LIFF_ID 時，連結退回站台網址而不是空白', async () => {
    vi.mocked(familyApi.createInvite).mockResolvedValue({
      ...inviteResponse,
      invite_url: null,
    });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /加入家人/ }));

    await waitFor(() => {
      expect(screen.getByLabelText('邀請連結')).toHaveValue(
        `${window.location.origin}/join?code=tok`,
      );
    });
  });

  it('展開後有「查看諮詢紀錄」，點了會帶著該成員的 id 導向諮詢頁', async () => {
    vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue(null);

    renderPage();
    // 收合時看不到，避免收合列上出現 button 巢狀 button
    expect(screen.queryByText('查看諮詢紀錄')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '媽媽' }));

    fireEvent.click(await screen.findByRole('button', { name: /查看諮詢紀錄/ }));

    expect(await screen.findByTestId('consult-probe')).toHaveTextContent('U-mom');
  });

  // ── 移除家人 ───────────────────────────────────────────────────────────
  //
  // 雙向切斷、不能復原（要重新邀請），所以一定先確認，確認框要把後果講完。

  describe('移除家人', () => {
    beforeEach(() => {
      vi.mocked(profileApi.getPersonalHealthProfile).mockResolvedValue(null);
    });

    async function openRemoveDialog() {
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: '媽媽' }));
      fireEvent.click(await screen.findByRole('button', { name: /移除這位家人/ }));
      return screen.findByRole('alertdialog');
    }

    it('收合時看不到移除鈕', () => {
      renderPage();

      expect(screen.queryByRole('button', { name: /移除這位家人/ })).not.toBeInTheDocument();
    });

    it('按下先開確認框，把雙向、看不到什麼、收不到通知、要重新邀請都講出來；取消不送出', async () => {
      const dialog = await openRemoveDialog();

      expect(within(dialog).getByText('要移除 媽媽 嗎？')).toBeInTheDocument();
      expect(dialog).toHaveTextContent('您和 媽媽 會同時從彼此的家人名單中移除');
      expect(dialog).toHaveTextContent('健康資料、用藥、掛號與對話紀錄');
      expect(dialog).toHaveTextContent('也不會再收到對方的提醒通知');
      expect(dialog).toHaveTextContent('之後要再加入，需要重新邀請。');

      fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));

      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(familyApi.removeFamilyMember).not.toHaveBeenCalled();
    });

    it('按「確定移除」才送出，送出中兩顆都停用；成功後失效族譜、角色清單與該成員的健康資料並提示', async () => {
      let finishRemove!: (value: { removed: boolean }) => void;
      vi.mocked(familyApi.removeFamilyMember).mockReturnValue(
        new Promise((resolve) => {
          finishRemove = resolve;
        }),
      );
      const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries');

      const dialog = await openRemoveDialog();
      fireEvent.click(within(dialog).getByRole('button', { name: '確定移除' }));

      expect(await within(dialog).findByRole('button', { name: '移除中…' })).toBeDisabled();
      expect(within(dialog).getByRole('button', { name: '取消' })).toBeDisabled();
      expect(familyApi.removeFamilyMember).toHaveBeenCalledWith('U-mom');

      await act(async () => {
        finishRemove({ removed: true });
      });

      expect(await screen.findByText('已移除 媽媽')).toBeInTheDocument();
      // 族譜重抓後這張卡片會消失，用藥頁「替誰設定」的名單也吃同一份
      expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual(
        expect.arrayContaining([
          queryKeys.familyTree,
          queryKeys.familyMemberRoles,
          queryKeys.memberProfile('U-mom'),
        ]),
      );
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      invalidate.mockRestore();
    });

    it('移除失敗時提示錯誤，卡片還在', async () => {
      vi.mocked(familyApi.removeFamilyMember).mockRejectedValue(
        Object.assign(new Error('boom'), { status: 500 }),
      );

      const dialog = await openRemoveDialog();
      fireEvent.click(within(dialog).getByRole('button', { name: '確定移除' }));

      expect(await screen.findByText('移除失敗，請稍後再試')).toBeInTheDocument();
      expect(screen.queryByText('已移除 媽媽')).not.toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(screen.getByRole('button', { name: '媽媽' })).toBeInTheDocument();
    });

    // 兩邊都能按移除；對方先按了的話，這邊看到的是快取裡的舊卡片。
    // 當成失敗會留下一張怎麼按都移除不掉的卡片。
    it('對方已經先移除（404）時當成已完成：提示已移除並重抓族譜，不報錯', async () => {
      vi.mocked(familyApi.removeFamilyMember).mockRejectedValue(
        Object.assign(new Error('不是家人'), { status: 404 }),
      );
      const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries');

      const dialog = await openRemoveDialog();
      fireEvent.click(within(dialog).getByRole('button', { name: '確定移除' }));

      expect(await screen.findByText('已移除 媽媽')).toBeInTheDocument();
      expect(screen.queryByText('移除失敗，請稍後再試')).not.toBeInTheDocument();
      expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toContainEqual(
        queryKeys.familyTree,
      );
      invalidate.mockRestore();
    });
  });
});

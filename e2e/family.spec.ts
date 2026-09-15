import type { Page } from '@playwright/test';

import { expect, seedLiffMock, t, test } from './fixtures';
import {
  FAMILY_MEMBERS,
  FULL_PERMISSIONS,
  NO_PERMISSIONS,
  familyTreeBody,
  stubApi,
  stubFamily,
  stubFamilyStore,
} from './stubs';

/**
 * 家庭頁：族譜列表四態、成員卡片展開後的健康資料三態、權限提示三態、移除家人、
 * 邀請流程（邀請 dialog：建立成功／失敗、分享到 LINE 成功／取消、外部瀏覽器 fallback）。
 */

const GRANDMA = FAMILY_MEMBERS[0];
const UNSET = FAMILY_MEMBERS[1];

async function openPage(page: Page) {
  await page.goto('/family');
  await expect(page.getByRole('heading', { name: t('family.title') })).toBeVisible();
}

test.describe('族譜列表', () => {
  test('載入中顯示骨架屏，之後進入空狀態並提供邀請鈕', async ({ authedPage }) => {
    await stubFamily(authedPage, [], { delayMs: 1500 });
    await openPage(authedPage);

    await expect(authedPage.locator('[aria-busy="true"]')).toBeVisible();
    await expect(authedPage.getByText(t('family.emptyTitle'))).toBeVisible({ timeout: 5000 });
    await expect(authedPage.getByText(t('family.empty'))).toBeVisible();
    await expect(authedPage.getByRole('button', { name: t('family.inviteBtn') })).toBeVisible();
    await expect(authedPage.getByText(t('family.desc'))).toBeVisible();
  });

  test('載入失敗顯示錯誤與重試，重試成功後顯示成員', async ({ authedPage }) => {
    let attempts = 0;
    await stubApi(authedPage, {
      path: '/api/family/me',
      respond: () => {
        attempts += 1;
        // TanStack Query 預設 retry 1 次：前兩次都失敗才會落入錯誤狀態
        return attempts <= 2
          ? { status: 500, body: { detail: '族譜服務忙碌中' } }
          : { status: 200, body: familyTreeBody(FAMILY_MEMBERS) };
      },
    });
    await openPage(authedPage);

    await expect(authedPage.getByText(t('family.errorTitle'))).toBeVisible({ timeout: 10000 });
    await expect(authedPage.getByText('族譜服務忙碌中')).toBeVisible();

    await authedPage.getByRole('button', { name: t('family.retry') }).click();

    await expect(authedPage.getByText(GRANDMA.display_name)).toBeVisible();
    await expect(authedPage.getByText(t('family.errorTitle'))).toHaveCount(0);
  });

  test('有成員時列出名字、稱謂、角色與人數，邀請鈕移到標題列', async ({ authedPage }) => {
    await stubFamily(authedPage, FAMILY_MEMBERS);
    await openPage(authedPage);

    await expect(authedPage.getByText(t('family.memberCount', { n: 2 }))).toBeVisible();
    const list = authedPage.getByRole('main').getByRole('list');
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(list).toContainText(GRANDMA.display_name);
    // RELATIONSHIP_LABEL_KEY.parent（family.relation.parent）
    await expect(list).toContainText('父/母');
    await expect(list).toContainText(t('familyRole.guardian'));
    await expect(list).toContainText(UNSET.display_name);
    // 稱謂與角色都沒設：只講權限未設定，不再印一個看不出是什麼的「未設定」
    await expect(list).toContainText(t('familyRole.cardUnassigned'));

    await expect(authedPage.getByRole('button', { name: t('family.inviteBtn') })).toHaveCount(1);
    await expect(authedPage.getByText(t('family.emptyTitle'))).toHaveCount(0);
  });
});

test.describe('成員卡片展開', () => {
  test.beforeEach(async ({ authedPage }) => {
    await stubFamily(authedPage, FAMILY_MEMBERS);
  });

  test('收合時不要健康資料；展開後顯示載入中，再列出已填的欄位', async ({ authedPage }) => {
    const profileCalls = await stubApi(authedPage, {
      path: `/api/profiles/${GRANDMA.user_id}`,
      delayMs: 800,
      body: {
        name: '林阿嬤',
        gender: 'female',
        age: 78,
        height: 155,
        weight: 52,
        chronic_diseases: ['hypertension'],
        chronic_custom: ['痛風'],
        major_illness_history: '',
        surgery_history: '白內障手術',
      },
    });
    await openPage(authedPage);

    await expect(authedPage.getByText(GRANDMA.display_name)).toBeVisible();
    expect(profileCalls).toHaveLength(0);

    await authedPage.getByRole('button', { name: GRANDMA.display_name }).click();

    await expect(authedPage.getByText(t('family.healthLoading'))).toBeVisible();
    await expect(authedPage.getByText(t('family.healthTitle'))).toBeVisible();

    const panel = authedPage.getByRole('main').locator('dl');
    await expect(panel).toBeVisible({ timeout: 5000 });
    await expect(panel).toContainText(`78 ${t('personalHealth.unit.age')}`);
    await expect(panel).toContainText(t('personalHealth.gender.female'));
    await expect(panel).toContainText(`155 ${t('personalHealth.unit.height')}`);
    await expect(panel).toContainText(`52 ${t('personalHealth.unit.weight')}`);
    await expect(panel).toContainText(t('personalHealth.chronic.hypertension'));
    await expect(panel).toContainText('痛風');
    await expect(panel).toContainText('白內障手術');
    // 空字串的欄位不產生列
    await expect(panel).not.toContainText(t('personalHealth.majorIllness'));
    expect(profileCalls).toHaveLength(1);
  });

  test('權限決定卡片展開後看得到什麼：完全無權、只有一般權、有敏感與私密權', async ({ authedPage }) => {
    const NO_ACCESS = { user_id: 'Unoaccess', relationship_type: 'sibling', display_name: '無權限', my_permissions: NO_PERMISSIONS };
    await stubFamily(authedPage, [FAMILY_MEMBERS[0], FAMILY_MEMBERS[1], NO_ACCESS]);
    const profileCalls = await stubApi(authedPage, {
      path: /^\/api\/profiles\/U/,
      body: { name: 'x', age: 70 },
    });
    await openPage(authedPage);

    // 完全無權：卡片上直接掛鎖頭徽章；展開後說「沒有權限」而不是「載入失敗」，且不發請求
    const noAccessRow = authedPage.getByRole('button', { name: NO_ACCESS.display_name });
    await expect(noAccessRow).toContainText(t('familyPermission.noAccess'));
    await noAccessRow.click();
    await expect(authedPage.getByText(t('familyPermission.noSensitive'))).toBeVisible();
    await expect(authedPage.getByText(t('familyPermission.askOwner')).first()).toBeVisible();
    expect(profileCalls).toHaveLength(0);

    // 只有一般權（王小明）：健康資料不顯示、諮詢紀錄入口不渲染而是鎖頭說明
    await authedPage.getByRole('button', { name: UNSET.display_name }).click();
    await expect(authedPage.getByText(t('familyPermission.noSensitive'))).toHaveCount(2);
    // 無權限那張與王小明這張都展開了，各有一則鎖頭說明
    await expect(authedPage.getByText(t('familyPermission.noPrivate'))).toHaveCount(2);
    await expect(authedPage.getByRole('button', { name: t('family.viewConsult') })).toHaveCount(0);
    expect(profileCalls).toHaveLength(0);

    // 有敏感寫入權與私密讀取權（林阿嬤）：健康資料、代填鈕、諮詢入口都在
    await authedPage.getByRole('button', { name: GRANDMA.display_name }).click();
    await expect(authedPage.getByText(`70 ${t('personalHealth.unit.age')}`)).toBeVisible();
    await expect(authedPage.getByRole('button', { name: t('familyPermission.proxyEdit') })).toBeVisible();
    await expect(authedPage.getByRole('button', { name: t('family.viewConsult') })).toBeVisible();
    expect(profileCalls).toHaveLength(1);
  });

  test('後端只有佔位值時視為尚無資料', async ({ authedPage }) => {
    await stubApi(authedPage, {
      path: `/api/profiles/${GRANDMA.user_id}`,
      body: { name: '', gender: 'unknown', age: 0, height: 1.0, weight: 1.0 },
    });
    await openPage(authedPage);

    await authedPage.getByRole('button', { name: GRANDMA.display_name }).click();

    await expect(authedPage.getByText(t('family.healthEmpty'))).toBeVisible();
  });

  test('健康資料 404（尚未建檔）也視為尚無資料，500 才顯示錯誤', async ({ authedPage }) => {
    // 王小明預設只有一般權，這裡給他完整權限才會發健康資料請求
    await stubFamily(authedPage, [GRANDMA, { ...UNSET, my_permissions: FULL_PERMISSIONS }]);
    await stubApi(authedPage, {
      path: `/api/profiles/${GRANDMA.user_id}`,
      status: 404,
      body: { detail: 'Not found' },
    });
    await stubApi(authedPage, {
      path: `/api/profiles/${UNSET.user_id}`,
      status: 500,
      body: { detail: 'boom' },
    });
    await openPage(authedPage);

    await authedPage.getByRole('button', { name: GRANDMA.display_name }).click();
    await expect(authedPage.getByText(t('family.healthEmpty'))).toBeVisible();

    await authedPage.getByRole('button', { name: UNSET.display_name }).click();
    await expect(authedPage.getByText(t('family.healthError'))).toBeVisible({ timeout: 10000 });
  });

  test('「查看諮詢紀錄」帶著成員 id 導向諮詢頁', async ({ authedPage }) => {
    await stubApi(authedPage, { path: `/api/profiles/${GRANDMA.user_id}`, status: 404, body: {} });
    await openPage(authedPage);

    await authedPage.getByRole('button', { name: GRANDMA.display_name }).click();
    await authedPage.getByRole('button', { name: t('family.viewConsult') }).click();

    await expect(authedPage).toHaveURL(
      new RegExp(`/personalhealth/consult\\?user=${GRANDMA.user_id}$`),
    );
  });
});

// 提示照「實際生效」的狀態講：rbac_migration_state 由後端算好（總閘打開且這位
// 擁有者已切換才是 enforced）。shadow 時說「未設定的人以一般家人處理」是謊話。
// i18next 的複數 key：fixtures 的 t() 不做複數解析，直接取 _one。
test.describe('權限提示', () => {
  const status = (overrides: Record<string, unknown>) => ({
    owner_id: 'me',
    is_complete: false,
    unassigned_member_ids: [UNSET.user_id],
    rbac_migration_state: 'shadow',
    ...overrides,
  });

  async function openWith(page: Page, roleAssignment: unknown) {
    await stubApi(page, {
      path: '/api/family/me',
      body: familyTreeBody(FAMILY_MEMBERS, roleAssignment),
    });
    await openPage(page);
  }

  test('還沒生效且有人沒設定：說在那之前所有家人都看得到，入口仍在', async ({ authedPage }) => {
    await openWith(authedPage, status({}));

    await expect(
      authedPage.getByText(t('familyRole.shadowPendingNotice_one', { count: 1 })),
    ).toBeVisible();
    await expect(
      authedPage.getByText(t('familyRole.unassignedNotice_one', { count: 1 })),
    ).toHaveCount(0);
    await expect(authedPage.getByRole('button', { name: t('familyRole.manage.open') })).toBeVisible();
  });

  test('已生效且有人沒設定：未設定的人以一般家人處理', async ({ authedPage }) => {
    await openWith(authedPage, status({ rbac_migration_state: 'enforced' }));

    await expect(
      authedPage.getByText(t('familyRole.unassignedNotice_one', { count: 1 })),
    ).toBeVisible();
    await expect(
      authedPage.getByText(t('familyRole.shadowPendingNotice_one', { count: 1 })),
    ).toHaveCount(0);
  });

  test('都設定好了卻還是 shadow（總閘關閉）：直說權限沒有生效', async ({ authedPage }) => {
    await openWith(authedPage, status({ is_complete: true, unassigned_member_ids: [] }));

    await expect(authedPage.getByText(t('familyRole.shadowOffNotice'))).toBeVisible();
  });
});

test.describe('移除家人', () => {
  test('按下移除先確認；取消不送出，確定後從名單消失、人數跟著變', async ({ authedPage }) => {
    const store = await stubFamilyStore(authedPage, FAMILY_MEMBERS);
    await stubApi(authedPage, { path: `/api/profiles/${GRANDMA.user_id}`, status: 404, body: {} });
    await openPage(authedPage);

    await authedPage.getByRole('button', { name: GRANDMA.display_name }).click();
    const removeButton = authedPage.getByRole('button', {
      name: t('familyPermission.remove.button'),
    });
    await removeButton.click();

    // 後果一次講完：雙向、看不到什麼、收不到通知、要重新邀請
    const dialog = authedPage.getByRole('alertdialog');
    await expect(dialog).toContainText(
      t('familyPermission.remove.title', { name: GRANDMA.display_name }),
    );
    await expect(dialog).toContainText(
      t('familyPermission.remove.desc', { name: GRANDMA.display_name }),
    );
    await expect(dialog).toContainText(t('familyPermission.remove.rejoin'));

    await dialog.getByRole('button', { name: t('familyPermission.cancel') }).click();
    await expect(authedPage.getByRole('alertdialog')).toHaveCount(0);
    expect(store.deletes).toHaveLength(0);

    await removeButton.click();
    await authedPage
      .getByRole('alertdialog')
      .getByRole('button', { name: t('familyPermission.remove.confirm') })
      .click();

    await expect(
      authedPage.getByText(t('familyPermission.remove.success', { name: GRANDMA.display_name })),
    ).toBeVisible();
    expect(store.deletes.map((call) => call.url.pathname)).toEqual([
      `/api/family/members/${GRANDMA.user_id}`,
    ]);
    const list = authedPage.getByRole('main').getByRole('list');
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list).not.toContainText(GRANDMA.display_name);
    await expect(authedPage.getByText(t('family.memberCount', { n: 1 }))).toBeVisible();
    await expect(authedPage.getByRole('alertdialog')).toHaveCount(0);
  });

  test('移除失敗時提示錯誤，家人還在名單上', async ({ authedPage }) => {
    await stubFamily(authedPage, FAMILY_MEMBERS);
    await stubApi(authedPage, { path: `/api/profiles/${GRANDMA.user_id}`, status: 404, body: {} });
    const deletes = await stubApi(authedPage, {
      path: `/api/family/members/${GRANDMA.user_id}`,
      method: 'DELETE',
      status: 500,
      body: { detail: 'boom' },
    });
    await openPage(authedPage);

    await authedPage.getByRole('button', { name: GRANDMA.display_name }).click();
    await authedPage.getByRole('button', { name: t('familyPermission.remove.button') }).click();
    await authedPage
      .getByRole('alertdialog')
      .getByRole('button', { name: t('familyPermission.remove.confirm') })
      .click();

    await expect(authedPage.getByText(t('familyPermission.remove.error'))).toBeVisible();
    expect(deletes).toHaveLength(1);
    await expect(
      authedPage.getByRole('main').getByRole('list').getByRole('listitem'),
    ).toHaveCount(2);
  });
});

test.describe('邀請家人', () => {
  // 三種遞出方式（QR、分享到 LINE、複製連結）共用同一組邀請碼，dialog 一開就建立。
  // qr_url 給 null：QR 圖是後端組的對外網址，e2e 不打外部資源，走「無法顯示 QR」分支。
  const INVITE = {
    invite_token: 'inv-token-123',
    expires_at: '2026-12-31T00:00:00Z',
    invite_url: 'https://liff.line.me/1234567890-abcdefgh/join?code=inv-token-123',
    qr_url: null,
  };

  async function openInviteDialog(page: Page) {
    await page.getByRole('button', { name: t('family.inviteBtn') }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(t('family.inviteDialog.title'))).toBeVisible();
    return dialog;
  }

  test('開啟 dialog 就建立邀請，顯示連結與單次使用提示', async ({ authedPage }) => {
    await seedLiffMock(authedPage, { isLoggedIn: true, isInClient: true, isApiAvailable: true });
    await stubFamily(authedPage, []);
    const invites = await stubApi(authedPage, {
      path: '/api/family/invites',
      method: 'POST',
      body: INVITE,
    });
    await openPage(authedPage);
    const dialog = await openInviteDialog(authedPage);

    await expect(dialog.getByText(t('family.inviteDialog.qrUnavailable'))).toBeVisible();
    await expect(dialog.getByText(t('family.inviteDialog.singleUse'))).toBeVisible();
    await expect(dialog.locator('#family-invite-url')).toHaveValue(INVITE.invite_url);
    await expect(
      dialog.getByRole('button', { name: t('family.inviteDialog.shareLine') }),
    ).toBeEnabled();
    await expect(
      dialog.getByRole('button', { name: t('family.inviteDialog.copyLink') }),
    ).toBeEnabled();
    expect(invites).toHaveLength(1);

    // 右上角內建的 X 也念「關閉」（common.close），這裡點底部那顆；
    // DialogContent 先渲染內容、最後才掛內建關閉鈕，所以底部那顆排第一。
    await dialog.getByRole('button', { name: t('family.inviteDialog.close') }).first().click();
    await expect(authedPage.getByRole('dialog')).toHaveCount(0);
  });

  test('在 LINE 內經 shareTargetPicker 送出後顯示成功並重新載入族譜', async ({ authedPage }) => {
    await seedLiffMock(authedPage, {
      isLoggedIn: true,
      isInClient: true,
      isApiAvailable: true,
      shareTargetPicker: { status: 'success' },
    });
    const familyCalls = await stubFamily(authedPage, []);
    await stubApi(authedPage, { path: '/api/family/invites', method: 'POST', body: INVITE });
    await openPage(authedPage);
    const dialog = await openInviteDialog(authedPage);

    await dialog.getByRole('button', { name: t('family.inviteDialog.shareLine') }).click();

    await expect(authedPage.getByText(t('family.inviteSuccess'))).toBeVisible();
    await expect.poll(() => familyCalls.length).toBeGreaterThanOrEqual(2);
  });

  test('在選擇器裡取消不算成功，不顯示任何 toast、dialog 留著', async ({ authedPage }) => {
    await seedLiffMock(authedPage, {
      isLoggedIn: true,
      isInClient: true,
      isApiAvailable: true,
      shareTargetPicker: null,
    });
    await stubFamily(authedPage, []);
    await stubApi(authedPage, { path: '/api/family/invites', method: 'POST', body: INVITE });
    await openPage(authedPage);
    const dialog = await openInviteDialog(authedPage);

    const share = dialog.getByRole('button', { name: t('family.inviteDialog.shareLine') });
    await share.click();

    await expect(share).toBeEnabled();
    await expect(dialog).toBeVisible();
    await expect(authedPage.getByText(t('family.inviteSuccess'))).toHaveCount(0);
    await expect(authedPage.getByText(t('family.inviteError'))).toHaveCount(0);
  });

  test('產生邀請碼失敗時 dialog 內顯示錯誤，沒有分享與複製鈕', async ({ authedPage }) => {
    await seedLiffMock(authedPage, { isLoggedIn: true, isInClient: true, isApiAvailable: true });
    await stubFamily(authedPage, []);
    await stubApi(authedPage, {
      path: '/api/family/invites',
      method: 'POST',
      status: 500,
      body: { detail: 'boom' },
    });
    await openPage(authedPage);
    const dialog = await openInviteDialog(authedPage);

    await expect(dialog.getByText(t('family.inviteDialog.createFailed'))).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: t('family.inviteDialog.shareLine') }),
    ).toHaveCount(0);
    // 同上：內建的 X 也念「關閉」，取底部那顆
    await expect(
      dialog.getByRole('button', { name: t('family.inviteDialog.close') }).first(),
    ).toBeVisible();
  });

  test('外部瀏覽器按「分享到 LINE」會提示需在 LINE 內操作，連結仍可用', async ({ authedPage }) => {
    await seedLiffMock(authedPage, { isLoggedIn: true, isInClient: false, isApiAvailable: false });
    await stubFamily(authedPage, []);
    await stubApi(authedPage, { path: '/api/family/invites', method: 'POST', body: INVITE });
    await openPage(authedPage);
    const dialog = await openInviteDialog(authedPage);

    await dialog.getByRole('button', { name: t('family.inviteDialog.shareLine') }).click();

    await expect(authedPage.getByText(t('family.inviteLineRequired'))).toBeVisible();
    // 不在 LINE 裡沒有路可走的只有分享；QR／連結仍在同一個畫面上
    await expect(dialog.locator('#family-invite-url')).toHaveValue(INVITE.invite_url);
  });
});

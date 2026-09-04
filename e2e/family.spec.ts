import type { Page } from '@playwright/test';

import { expect, seedLiffMock, t, test } from './fixtures';
import {
  FAMILY_MEMBERS,
  FULL_PERMISSIONS,
  NO_PERMISSIONS,
  familyTreeBody,
  stubApi,
  stubFamily,
} from './stubs';

/**
 * 家庭頁：族譜列表四態、成員卡片展開後的健康資料三態、邀請流程
 * （shareTargetPicker 成功／取消／失敗、瀏覽器 fallback）。
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

  test('有成員時列出名字、稱謂與人數，邀請鈕移到標題列', async ({ authedPage }) => {
    await stubFamily(authedPage, FAMILY_MEMBERS);
    await openPage(authedPage);

    await expect(authedPage.getByText(t('family.memberCount', { n: 2 }))).toBeVisible();
    const list = authedPage.getByRole('main').getByRole('list');
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(list).toContainText(GRANDMA.display_name);
    // RELATIONSHIP_LABEL.parent
    await expect(list).toContainText('父/母');
    await expect(list).toContainText(UNSET.display_name);
    await expect(list).toContainText(t('family.unset'));

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

  test('還有家人未設定角色時顯示提示與管理入口', async ({ authedPage }) => {
    await stubApi(authedPage, {
      path: '/api/family/me',
      body: familyTreeBody(FAMILY_MEMBERS, {
        owner_id: 'me',
        is_complete: false,
        unassigned_member_ids: [FAMILY_MEMBERS[1].user_id],
        rbac_migration_state: 'shadow',
      }),
    });
    await openPage(authedPage);

    // i18next 的複數 key：fixtures 的 t() 不做複數解析，直接取 _one
    await expect(
      authedPage.getByText(t('familyRole.unassignedNotice_one', { count: 1 })),
    ).toBeVisible();
    await expect(authedPage.getByRole('button', { name: t('familyRole.manage.open') })).toBeVisible();
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

test.describe('邀請家人', () => {
  const INVITE = { invite_token: 'inv-token-123', expires_at: '2026-12-31T00:00:00Z' };

  test('在 LINE 內經 shareTargetPicker 送出後顯示成功並重新載入族譜', async ({ authedPage }) => {
    await seedLiffMock(authedPage, {
      isLoggedIn: true,
      isInClient: true,
      isApiAvailable: true,
      shareTargetPicker: { status: 'success' },
    });
    const familyCalls = await stubFamily(authedPage, []);
    const invites = await stubApi(authedPage, {
      path: '/api/family/invites',
      method: 'POST',
      body: INVITE,
    });
    await openPage(authedPage);

    const button = authedPage.getByRole('button', { name: t('family.inviteBtn') });
    await expect(button).toBeEnabled();
    await button.click();

    await expect(authedPage.getByText(t('family.inviteSuccess'))).toBeVisible();
    expect(invites).toHaveLength(1);
    await expect.poll(() => familyCalls.length).toBeGreaterThanOrEqual(2);
  });

  test('在選擇器裡取消不算成功，不顯示任何 toast', async ({ authedPage }) => {
    await seedLiffMock(authedPage, {
      isLoggedIn: true,
      isInClient: true,
      isApiAvailable: true,
      shareTargetPicker: null,
    });
    await stubFamily(authedPage, []);
    await stubApi(authedPage, { path: '/api/family/invites', method: 'POST', body: INVITE });
    await openPage(authedPage);

    await authedPage.getByRole('button', { name: t('family.inviteBtn') }).click();

    await expect(authedPage.getByRole('button', { name: t('family.inviteBtn') })).toBeEnabled();
    await expect(authedPage.getByText(t('family.inviteSuccess'))).toHaveCount(0);
    await expect(authedPage.getByText(t('family.inviteError'))).toHaveCount(0);
  });

  test('產生邀請碼失敗時顯示錯誤 toast', async ({ authedPage }) => {
    await seedLiffMock(authedPage, { isLoggedIn: true, isInClient: true, isApiAvailable: true });
    await stubFamily(authedPage, []);
    await stubApi(authedPage, {
      path: '/api/family/invites',
      method: 'POST',
      status: 500,
      body: { detail: 'boom' },
    });
    await openPage(authedPage);

    await authedPage.getByRole('button', { name: t('family.inviteBtn') }).click();

    await expect(authedPage.getByText(t('family.inviteError'))).toBeVisible();
  });

  test('外部瀏覽器且無系統分享時，提示需在 LINE 內操作', async ({ authedPage }) => {
    await seedLiffMock(authedPage, { isLoggedIn: true, isInClient: false, isApiAvailable: false });
    // 桌面 Chromium 沒有 navigator.share；WebKit 可能有，統一拿掉才測得到這條分支
    await authedPage.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    });
    await stubFamily(authedPage, []);
    await stubApi(authedPage, { path: '/api/family/invites', method: 'POST', body: INVITE });
    await openPage(authedPage);

    await authedPage.getByRole('button', { name: t('family.inviteBtn') }).click();

    await expect(authedPage.getByText(t('family.inviteLineRequired'))).toBeVisible();
  });
});

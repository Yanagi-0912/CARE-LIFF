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
 * 家人：健康首頁的家人區塊（載入、空、錯誤、列表）、家人資料頁（權限降級、健康資料三態、
 * 稱謂、諮詢紀錄、位置、移除）、查詢紀錄、設定權限、權限提示，以及邀請流程。
 */

const GRANDMA = FAMILY_MEMBERS[0];
const UNSET = FAMILY_MEMBERS[1];

async function openHome(page: Page) {
  await page.goto('/personalhealth');
  await expect(page.getByRole('heading', { name: t('healthHome.family'), exact: true })).toBeVisible();
}

async function openMember(page: Page, member: { user_id: string }) {
  await page.goto(`/family/members/${member.user_id}`);
  await expect(page.getByRole('heading', { name: t('familyMember.title') })).toBeVisible();
}

const familyList = (page: Page) =>
  page.getByRole('region', { name: t('healthHome.family') }).getByRole('list');

test.describe('舊網址與分類子頁', () => {
  test('/family、/family/members 與未知網址都轉到首頁', async ({ authedPage }) => {
    await stubFamily(authedPage, FAMILY_MEMBERS);
    for (const path of ['/family', '/family/members', '/family/unknown']) {
      await authedPage.goto(path);
      await expect(authedPage).toHaveURL(/:\d+\/$/);
      await expect(familyList(authedPage)).toContainText(GRANDMA.display_name);
    }
  });

  test('直接開照護權限即可設定角色，更新後顯示實際角色', async ({ authedPage }) => {
    await stubFamily(authedPage, [GRANDMA]);
    let role = 'MEMBER';
    await stubApi(authedPage, {
      path: '/api/family/members/roles',
      respond: () => ({ status: 200, body: [
        { user_id: GRANDMA.user_id, display_name: GRANDMA.display_name, family_role: role, effective_family_role: role },
      ] }),
    });
    const changes = await stubApi(authedPage, {
      path: `/api/family/members/${GRANDMA.user_id}/role`,
      method: 'PUT',
      respond: (request) => {
        role = (request.body as { family_role: string }).family_role;
        return { status: 200, body: familyTreeBody([{ ...GRANDMA, family_role: role }]).family_tree };
      },
    });
    await authedPage.goto('/family/permissions');
    await expect(authedPage.getByRole('heading', { name: t('familyNavigation.permissions') })).toBeVisible();
    await authedPage.getByRole('button', { name: t('familyRole.guardian'), exact: true }).click();
    await expect(authedPage.getByRole('button', { name: t('familyRole.guardian'), exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(authedPage.getByText(t('familyRole.manage.saved', { name: GRANDMA.display_name }))).toBeVisible();
    expect(changes.map((change) => change.body)).toEqual([{ family_role: 'GUARDIAN' }]);
  });

  for (const [status, key] of [[403, 'lost.watch.forbidden'], [404, 'lost.watch.notFound']] as const) {
    test(`家人位置由後端區分 ${status}，不以健康資料權限代替`, async ({ authedPage }) => {
      await stubFamily(authedPage, [{ ...GRANDMA, my_permissions: NO_PERMISSIONS }]);
      const calls = await stubApi(authedPage, {
        path: `/api/lost/${GRANDMA.user_id}`,
        status,
        body: { detail: 'location unavailable' },
      });
      await openMember(authedPage, GRANDMA);
      await authedPage.getByRole('link', { name: t('familyMember.location') }).click();
      await expect(authedPage).toHaveURL(new RegExp(`/lost/watch\\?user=${GRANDMA.user_id}$`));
      await expect(authedPage.getByText(t(key))).toBeVisible();
      expect(calls).toHaveLength(1);
    });
  }
});

test.describe('健康首頁的家人區塊', () => {
  test('載入中顯示骨架，之後進入空狀態，只留家人列最後的加入家人', async ({ authedPage }) => {
    await stubFamily(authedPage, [], { delayMs: 1500 });
    await openHome(authedPage);

    await expect(authedPage.locator('[aria-busy="true"]')).toBeVisible();
    await expect(authedPage.getByText(t('family.empty'))).toBeVisible({ timeout: 5000 });
    await expect(authedPage.getByRole('button', { name: t('healthHome.addFamilyTile') })).toBeVisible();
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
    await openHome(authedPage);

    await expect(authedPage.getByText(t('healthHome.familyLoadError'))).toBeVisible({ timeout: 10000 });
    await expect(authedPage.getByText('族譜服務忙碌中')).toBeVisible();

    await authedPage.getByRole('button', { name: t('family.retry') }).click();

    await expect(familyList(authedPage)).toContainText(GRANDMA.display_name);
    await expect(authedPage.getByText(t('healthHome.familyLoadError'))).toHaveCount(0);
  });

  test('有成員時列出名字、權限狀態與角色，點了進家人資料頁', async ({ authedPage }) => {
    await stubFamily(authedPage, FAMILY_MEMBERS);
    await stubApi(authedPage, { path: `/api/profiles/${GRANDMA.user_id}`, status: 404, body: {} });
    await openHome(authedPage);

    const list = familyList(authedPage);
    // 兩位家人加上「加入家人」格子
    await expect(list.getByRole('listitem')).toHaveCount(3);
    await expect(list).toContainText(GRANDMA.display_name);
    await expect(list).toContainText(t('familyMember.roleSet'));
    await expect(list).toContainText(t('familyRole.guardian'));
    await expect(list).toContainText(UNSET.display_name);
    // 角色沒設：講明是權限未設定，不畫成一般家人
    await expect(list).toContainText(t('familyMember.roleUnset'));

    await list.getByRole('link', { name: new RegExp(GRANDMA.display_name) }).click();
    await expect(authedPage).toHaveURL(new RegExp(`/family/members/${GRANDMA.user_id}$`));
    await expect(authedPage.getByText('父/母')).toBeVisible();
  });
});

test.describe('家人資料頁', () => {
  test.beforeEach(async ({ authedPage }) => {
    await stubFamily(authedPage, FAMILY_MEMBERS);
  });

  test('進頁後顯示載入中，再列出已填的健康欄位', async ({ authedPage }) => {
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
    await openMember(authedPage, GRANDMA);

    await expect(authedPage.getByText(t('family.healthLoading')).first()).toBeVisible();
    const panel = authedPage.getByRole('region', { name: t('family.healthTitle') }).locator('dl');
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

  test('權限決定看得到什麼：完全無權、只有一般權、有敏感與私密權', async ({ authedPage }) => {
    const NO_ACCESS = { user_id: 'Unoaccess', relationship_type: 'sibling', display_name: '無權限', my_permissions: NO_PERMISSIONS };
    await stubFamily(authedPage, [FAMILY_MEMBERS[0], FAMILY_MEMBERS[1], NO_ACCESS]);
    const profileCalls = await stubApi(authedPage, {
      path: /^\/api\/profiles\/U/,
      body: { name: 'x', age: 70 },
    });

    // 完全無權：說「沒有權限」而不是「載入失敗」，且不發請求
    await openMember(authedPage, NO_ACCESS);
    await expect(authedPage.getByText(t('familyPermission.noAccess'))).toBeVisible();
    await expect(authedPage.getByText(t('familyPermission.noSensitive'))).toBeVisible();
    await expect(authedPage.getByText(t('familyPermission.askOwner'))).toBeVisible();
    expect(profileCalls).toHaveLength(0);

    // 只有一般權（王小明）：健康資料不顯示、諮詢紀錄入口不渲染而是鎖頭說明
    await openMember(authedPage, UNSET);
    await expect(authedPage.getByText(t('familyPermission.noSensitive'))).toBeVisible();
    await expect(authedPage.getByText(t('familyPermission.noPrivate'))).toBeVisible();
    await expect(authedPage.getByRole('button', { name: t('family.viewConsult') })).toHaveCount(0);
    expect(profileCalls).toHaveLength(0);

    // 有敏感寫入權與私密讀取權（林阿嬤）：健康資料、代填鈕、諮詢入口都在
    await openMember(authedPage, GRANDMA);
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
    await openMember(authedPage, GRANDMA);
    await expect(authedPage.getByText(t('family.healthEmpty'))).toBeVisible();
  });

  test('健康資料 404（尚未建檔）也視為尚無資料，500 才顯示錯誤', async ({ authedPage }) => {
    // 王小明預設只有一般權，這裡給他完整權限才會發健康資料請求
    await stubFamily(authedPage, [GRANDMA, { ...UNSET, my_permissions: FULL_PERMISSIONS }]);
    await stubApi(authedPage, { path: `/api/profiles/${GRANDMA.user_id}`, status: 404, body: { detail: 'Not found' } });
    await stubApi(authedPage, { path: `/api/profiles/${UNSET.user_id}`, status: 500, body: { detail: 'boom' } });

    await openMember(authedPage, GRANDMA);
    await expect(authedPage.getByText(t('family.healthEmpty'))).toBeVisible();

    await openMember(authedPage, UNSET);
    await expect(authedPage.getByText(t('family.healthError'))).toBeVisible({ timeout: 10000 });
  });

  test('「查看諮詢紀錄」帶著成員 id 導向諮詢頁', async ({ authedPage }) => {
    await stubApi(authedPage, { path: `/api/profiles/${GRANDMA.user_id}`, status: 404, body: {} });
    await openMember(authedPage, GRANDMA);
    await authedPage.getByRole('button', { name: t('family.viewConsult') }).click();
    await expect(authedPage).toHaveURL(new RegExp(`/personalhealth/consult\\?user=${GRANDMA.user_id}$`));
  });

  test('手機大字級可獨立設定稱謂，儲存後不用重新整理就更新', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 375, height: 812 });
    await authedPage.addInitScript(() => {
      localStorage.setItem('care-settings', JSON.stringify({ language: 'zh-TW', fontSize: 'xlarge' }));
    });
    const store = await stubFamilyStore(authedPage, [
      { ...UNSET, relationship_type: null, my_permissions: FULL_PERMISSIONS },
    ]);
    await stubApi(authedPage, { path: `/api/profiles/${UNSET.user_id}`, status: 404, body: {} });
    await openMember(authedPage, UNSET);

    const main = authedPage.getByRole('main');
    await expect(main).toContainText(t('familyRelationship.unset'));
    await authedPage.getByRole('button', { name: t('familyRelationship.manage.open') }).click();

    const dialog = authedPage.getByRole('dialog', { name: t('familyRelationship.manage.title') });
    await expect(dialog).toBeVisible();
    for (const label of ['父/母', '子/女', '配偶', '兄弟姊妹', '祖父母', '孫子女', '其他']) {
      await expect(dialog.getByRole('button', { name: label })).toBeVisible();
    }
    await dialog.getByRole('button', { name: '子/女' }).click();
    await dialog.getByRole('button', { name: t('familyPermission.save') }).click();

    await expect(authedPage.getByText(t('familyRelationship.manage.saved', { name: UNSET.display_name }))).toBeVisible();
    expect(store.relationships).toHaveLength(1);
    expect(store.relationships[0].body).toEqual({ member_id: UNSET.user_id, relationship_type: 'child' });
    await expect(authedPage.getByRole('dialog')).toHaveCount(0);
    await expect(main).toContainText('子/女');
    await expect(main).not.toContainText(t('familyRelationship.unset'));
    // 特大字級下不能撐出橫向捲動
    expect(await authedPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('查詢紀錄與設定權限', () => {
  test('未設定角色：只給設定權限，查詢紀錄頁說明要先設定', async ({ authedPage }) => {
    await stubFamily(authedPage, [UNSET]);
    await openMember(authedPage, UNSET);

    await expect(authedPage.getByText(t('familyMember.unsetDesc'))).toBeVisible();
    await expect(authedPage.getByRole('link', { name: new RegExp(t('familyMember.access')) })).toHaveCount(0);

    await authedPage.goto(`/family/members/${UNSET.user_id}/access`);
    await expect(authedPage.getByText(t('familyAccess.unsetDesc'))).toBeVisible();
    await authedPage.getByRole('link', { name: t('familyAccess.back') }).click();
    await expect(authedPage).toHaveURL(new RegExp(`/family/members/${UNSET.user_id}$`));
  });

  test('主要照顧者：查詢紀錄列出四類資料與能做的事，提醒只有說明', async ({ authedPage }) => {
    await stubFamily(authedPage, [GRANDMA]);
    await stubApi(authedPage, { path: `/api/profiles/${GRANDMA.user_id}`, status: 404, body: {} });
    await openMember(authedPage, GRANDMA);

    await expect(authedPage.getByText(t('familyMember.notifyOn'))).toBeVisible();
    await expect(authedPage.getByRole('switch')).toHaveCount(0);
    await authedPage.getByRole('link', { name: new RegExp(t('familyMember.access')) }).click();

    await expect(authedPage.getByRole('heading', { name: t('familyAccess.title') })).toBeVisible();
    const rows = authedPage.getByRole('main').getByRole('listitem');
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText(t('familyAccess.category.medicationsAppointments'));
    await expect(rows.nth(0)).toContainText(t('familyAccess.level.manage'));
    await expect(rows.nth(3)).toContainText(t('familyAccess.category.consultations'));
    await expect(rows.nth(3)).toContainText(t('familyAccess.level.read'));
  });

  test('設定權限：選角色後按儲存才送出，回到家人資料頁顯示新角色', async ({ authedPage }) => {
    const store = { role: null as string | null };
    await stubApi(authedPage, {
      path: '/api/family/me',
      method: 'GET',
      respond: () => ({ status: 200, body: familyTreeBody([{ ...UNSET, family_role: store.role }]) }),
    });
    const puts = await stubApi(authedPage, {
      path: `/api/family/members/${UNSET.user_id}/role`,
      method: 'PUT',
      respond: (request) => {
        store.role = (request.body as { family_role: string }).family_role;
        return { status: 200, body: familyTreeBody([{ ...UNSET, family_role: store.role }]).family_tree };
      },
    });
    await authedPage.goto(`/family/members/${UNSET.user_id}/role`);

    await expect(authedPage.getByText(t('familyAccess.menstrualNote'))).toBeVisible();
    const save = authedPage.getByRole('button', { name: t('familyRolePage.save') });
    await expect(save).toBeDisabled();
    await authedPage.getByRole('radio', { name: new RegExp(`^${t('familyRole.caregiver')}`) }).click();
    expect(puts).toHaveLength(0);
    await save.click();

    await expect(authedPage.getByText(t('familyRole.manage.saved', { name: UNSET.display_name }))).toBeVisible();
    expect(puts.map((call) => call.body)).toEqual([{ family_role: 'CAREGIVER' }]);
    await expect(authedPage).toHaveURL(new RegExp(`/family/members/${UNSET.user_id}$`));
    await expect(authedPage.getByRole('main')).toContainText(t('familyRole.caregiver'));
    await expect(authedPage.getByText(t('familyMember.notifyOn'))).toBeVisible();
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
    // 首頁只用家人格子上的標籤表示權限；完整說明放在設定權限頁
    await page.goto(`/family/members/${UNSET.user_id}/role`);
  }

  test('首頁不放權限提示框與設定入口，只看標籤', async ({ authedPage }) => {
    await stubApi(authedPage, { path: '/api/family/me', body: familyTreeBody(FAMILY_MEMBERS, status({})) });
    await openHome(authedPage);

    await expect(authedPage.getByText(t('familyRole.shadowPendingNotice_one', { count: 1 }))).toHaveCount(0);
    await expect(authedPage.getByRole('link', { name: t('familyRole.manage.open') })).toHaveCount(0);
    await expect(authedPage.getByRole('link', { name: new RegExp(UNSET.display_name) })).toContainText(t('familyMember.roleUnset'));
  });

  test('還沒生效且有人沒設定：設定權限頁說在那之前所有家人都看得到', async ({ authedPage }) => {
    await openWith(authedPage, status({}));

    await expect(authedPage.getByText(t('familyRole.shadowPendingNotice_one', { count: 1 }))).toBeVisible();
    await expect(authedPage.getByText(t('familyRole.unassignedNotice_one', { count: 1 }))).toHaveCount(0);
  });

  test('已生效且有人沒設定：未設定的人以一般家人處理', async ({ authedPage }) => {
    await openWith(authedPage, status({ rbac_migration_state: 'enforced' }));

    await expect(authedPage.getByText(t('familyRole.unassignedNotice_one', { count: 1 }))).toBeVisible();
    await expect(authedPage.getByText(t('familyRole.shadowPendingNotice_one', { count: 1 }))).toHaveCount(0);
  });

  test('都設定好了卻還是 shadow（總閘關閉）：直說權限沒有生效', async ({ authedPage }) => {
    await openWith(authedPage, status({ is_complete: true, unassigned_member_ids: [] }));

    await expect(authedPage.getByText(t('familyRole.shadowOffNotice'))).toBeVisible();
  });
});

test.describe('移除家人', () => {
  test('按下移除先確認；取消不送出，確定後回到首頁、名單少了她', async ({ authedPage }) => {
    const store = await stubFamilyStore(authedPage, FAMILY_MEMBERS);
    await stubApi(authedPage, { path: `/api/profiles/${GRANDMA.user_id}`, status: 404, body: {} });
    await openMember(authedPage, GRANDMA);

    const removeButton = authedPage.getByRole('button', { name: t('familyMember.remove') });
    await removeButton.click();

    // 後果一次講完：雙向、看不到什麼、收不到通知、要重新邀請
    const dialog = authedPage.getByRole('alertdialog');
    await expect(dialog).toContainText(t('familyPermission.remove.title', { name: GRANDMA.display_name }));
    await expect(dialog).toContainText(t('familyPermission.remove.desc', { name: GRANDMA.display_name }));
    await expect(dialog).toContainText(t('familyPermission.remove.rejoin'));

    await dialog.getByRole('button', { name: t('familyPermission.cancel') }).click();
    await expect(authedPage.getByRole('alertdialog')).toHaveCount(0);
    expect(store.deletes).toHaveLength(0);

    await removeButton.click();
    await authedPage.getByRole('alertdialog').getByRole('button', { name: t('familyPermission.remove.confirm') }).click();

    await expect(authedPage.getByText(t('familyPermission.remove.success', { name: GRANDMA.display_name }))).toBeVisible();
    expect(store.deletes.map((call) => call.url.pathname)).toEqual([`/api/family/members/${GRANDMA.user_id}`]);
    await expect(authedPage).toHaveURL(/:\d+\/$/);
    const list = familyList(authedPage);
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(list).not.toContainText(GRANDMA.display_name);
    await expect(authedPage.getByRole('alertdialog')).toHaveCount(0);
  });

  test('移除失敗時提示錯誤，留在家人資料頁', async ({ authedPage }) => {
    await stubFamily(authedPage, FAMILY_MEMBERS);
    await stubApi(authedPage, { path: `/api/profiles/${GRANDMA.user_id}`, status: 404, body: {} });
    const deletes = await stubApi(authedPage, {
      path: `/api/family/members/${GRANDMA.user_id}`,
      method: 'DELETE',
      status: 500,
      body: { detail: 'boom' },
    });
    await openMember(authedPage, GRANDMA);

    await authedPage.getByRole('button', { name: t('familyMember.remove') }).click();
    await authedPage.getByRole('alertdialog').getByRole('button', { name: t('familyPermission.remove.confirm') }).click();

    await expect(authedPage.getByText(t('familyPermission.remove.error'))).toBeVisible();
    expect(deletes).toHaveLength(1);
    await expect(authedPage).toHaveURL(new RegExp(`/family/members/${GRANDMA.user_id}$`));
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
    await page.getByRole('button', { name: t('healthHome.addFamilyTile') }).click();
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
    await openHome(authedPage);
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
    await openHome(authedPage);
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
    await openHome(authedPage);
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
    await openHome(authedPage);
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
    await openHome(authedPage);
    const dialog = await openInviteDialog(authedPage);

    await dialog.getByRole('button', { name: t('family.inviteDialog.shareLine') }).click();

    await expect(authedPage.getByText(t('family.inviteLineRequired'))).toBeVisible();
    // 不在 LINE 裡沒有路可走的只有分享；QR／連結仍在同一個畫面上
    await expect(dialog.locator('#family-invite-url')).toHaveValue(INVITE.invite_url);
  });
});

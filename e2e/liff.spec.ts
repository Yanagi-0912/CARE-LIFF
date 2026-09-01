import {
  AUTH_TOKEN,
  expect,
  seedLiffMock,
  stubLiffLogin,
  stubProfileApi,
  t,
  test,
} from './fixtures';

/**
 * LIFF 相關分支。
 *
 * 這些路徑在 Phase 1 完全沒有覆蓋——當時 e2e 是在「LIFF 不存在」的模式下跑的，
 * 而 App 裡實際用了 14 種 LIFF API。vitest 那邊雖然有 vi.mock('@line/liff')，
 * 但那是 Vitest 的編譯期魔法，在真瀏覽器裡無效。
 *
 * 這裡改用 LINE 官方的 @line/liff-mock：真的載入 LIFF SDK、真的呼叫 liff.init()，
 * 只是所有 API 回傳假資料，全程不連 LINE 的伺服器。
 *
 * 假資料一律用 seedLiffMock() 在 goto 之前寫好，避免與 App 啟動搶時序。
 */

const LINE_ID_TOKEN = 'mock-line-id-token';
const SERVER_TOKEN = 'server-issued-access-token';
const LINE_USER_ID = 'U0123456789abcdef0123456789abcdef';

test.describe('LINE 登入換發後端憑證', () => {
  test('在 LINE 內已登入時，用 ID token 換到 CARE 的存取憑證', async ({ anonymousPage }) => {
    await seedLiffMock(anonymousPage, {
      isLoggedIn: true,
      isInClient: true,
      getIDToken: LINE_ID_TOKEN,
    });
    const receivedIdTokens = await stubLiffLogin(anonymousPage, {
      access_token: SERVER_TOKEN,
      line_user_id: LINE_USER_ID,
    });

    await anonymousPage.goto('/');

    // 換發成功後會離開登入頁回到首頁
    await expect(anonymousPage).toHaveURL(/\/$/);
    await expect(anonymousPage.getByRole('banner')).toBeVisible();

    await expect
      .poll(() => anonymousPage.evaluate(() => localStorage.getItem('CARE_AUTH_TOKEN')))
      .toBe(SERVER_TOKEN);
    expect(
      await anonymousPage.evaluate(() => localStorage.getItem('CARE_LINE_USER_ID')),
    ).toBe(LINE_USER_ID);

    // 確認送給後端的真的是 LIFF 給的 ID token，而不是別的東西
    expect(receivedIdTokens).toContain(LINE_ID_TOKEN);
  });

  test('後端換發失敗時，退回既有的本地憑證而不是把人踢出去', async ({ authedPage }) => {
    await seedLiffMock(authedPage, { isLoggedIn: true, getIDToken: LINE_ID_TOKEN });
    await stubLiffLogin(authedPage, { status: 500 });

    await authedPage.goto('/');

    await expect(authedPage.getByRole('banner')).toBeVisible();
    expect(
      await authedPage.evaluate(() => localStorage.getItem('CARE_AUTH_TOKEN')),
    ).toBe(AUTH_TOKEN);
  });

  test('LIFF 未登入時停在登入頁，不會擅自放行', async ({ anonymousPage }) => {
    await seedLiffMock(anonymousPage, { isLoggedIn: false, isInClient: false });

    await anonymousPage.goto('/personalhealth');

    await expect(anonymousPage).toHaveURL(/\/login(\?|$)/);
    // liff.login() 在 mock 下是 no-op，所以會停在本站；真環境才會跳 LINE 授權頁
    await expect(anonymousPage).toHaveURL(/localhost/);
    expect(
      await anonymousPage.evaluate(() => localStorage.getItem('CARE_AUTH_TOKEN')),
    ).toBeNull();
  });
});

test.describe('LINE 個人資料（liff.getProfile）', () => {
  const LINE_DISPLAY_NAME = '林阿嬤';

  test('尚未建檔時，用 LINE 顯示名稱預填姓名欄位', async ({ authedPage }) => {
    await seedLiffMock(authedPage, {
      isLoggedIn: true,
      getProfile: {
        displayName: LINE_DISPLAY_NAME,
        userId: LINE_USER_ID,
        pictureUrl: 'https://example.invalid/avatar.png',
      },
    });
    // fixture 預設就是 404（尚未建檔），這裡明寫是為了讓意圖清楚
    await stubProfileApi(authedPage, null);

    await authedPage.goto('/personalhealth');

    await expect(authedPage.locator('#name')).toHaveValue(LINE_DISPLAY_NAME);
  });

  test('伺服器已有姓名時，不會被 LINE 顯示名稱蓋掉', async ({ authedPage }) => {
    await seedLiffMock(authedPage, {
      isLoggedIn: true,
      getProfile: { displayName: LINE_DISPLAY_NAME, userId: LINE_USER_ID },
    });
    await stubProfileApi(authedPage, { name: '王大明', gender: 'male', age: 72 });

    await authedPage.goto('/personalhealth');

    // 兩個 effect 誰先回來都不該影響結果（見 PersonalHealth 內的註解）
    await expect(authedPage.locator('#name')).toHaveValue('王大明');
    await expect(authedPage.locator('#name')).not.toHaveValue(LINE_DISPLAY_NAME);
  });
});

test.describe('主動登出後不得自動登回去', () => {
  /**
   * 這條守的是一個已修好的 bug：LINE 那側的 session 仍然有效，
   * 登出後只要有人再呼叫一次換發，使用者就會被瞬間登回去，
   * 症狀是「按了登出完全沒反應」。防線是 sessionStorage 的 CARE_LOGGED_OUT 旗標。
   *
   * 沒有 LIFF mock 就測不到這條——要重現它，LIFF 必須是「已登入」狀態。
   */
  test('從設定頁登出後停在登入頁，且不會自動換發新憑證', async ({ authedPage }) => {
    await seedLiffMock(authedPage, { isLoggedIn: true, getIDToken: LINE_ID_TOKEN });
    await stubLiffLogin(authedPage, {
      access_token: SERVER_TOKEN,
      line_user_id: LINE_USER_ID,
    });

    await authedPage.goto('/settings');
    await authedPage.getByRole('button', { name: t('settings.logout') }).click();

    await expect(authedPage).toHaveURL(/\/login(\?|$)/);
    // 停在這裡等使用者自己按，不自動跳 LINE 授權頁
    await expect(
      authedPage.getByRole('button', { name: '使用 LINE 重新登入' }),
    ).toBeVisible();

    await expect
      .poll(() => authedPage.evaluate(() => localStorage.getItem('CARE_AUTH_TOKEN')))
      .toBeNull();
  });

  test('按下「使用 LINE 重新登入」才會重新換發憑證', async ({ authedPage }) => {
    await seedLiffMock(authedPage, { isLoggedIn: true, getIDToken: LINE_ID_TOKEN });
    await stubLiffLogin(authedPage, {
      access_token: SERVER_TOKEN,
      line_user_id: LINE_USER_ID,
    });

    await authedPage.goto('/settings');
    await authedPage.getByRole('button', { name: t('settings.logout') }).click();
    await authedPage.getByRole('button', { name: '使用 LINE 重新登入' }).click();

    await expect
      .poll(() => authedPage.evaluate(() => localStorage.getItem('CARE_AUTH_TOKEN')))
      .toBe(SERVER_TOKEN);
    // 回到被踢出來時的那一頁，而不是首頁——深連結還原（saveRedirectUrl）也一起驗到
    await expect(authedPage).toHaveURL(/\/settings$/);
  });
});

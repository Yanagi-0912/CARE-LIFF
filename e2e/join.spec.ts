import { expect, t, test } from './fixtures';
import { stubApi } from './stubs';

/**
 * 加入家庭（/join?code=…）：驗證中→預覽→接受→成功／已是成員／失敗，
 * 以及沒有 code、code 失效、未登入三種入口錯誤。
 */

const CODE = 'abc123';
const INVITER = { inviter_display_name: '林阿嬤', expires_at: '2026-12-31T00:00:00Z' };

test.describe('加入家庭', () => {
  test('沒有邀請碼直接顯示連結無效，回首頁鈕可用', async ({ authedPage }) => {
    await authedPage.goto('/join');

    await expect(authedPage.getByText(t('family.join.invalidTitle'))).toBeVisible();
    await expect(authedPage.getByText(t('family.join.invalidCode'))).toBeVisible();
    await authedPage.getByRole('button', { name: t('common.backHome') }).click();
    await expect(authedPage).toHaveURL(/\/$/);
  });

  test('未登入時導到登入頁', async ({ anonymousPage }) => {
    await anonymousPage.goto(`/join?code=${CODE}`);

    await expect(anonymousPage).toHaveURL(/\/login(\?|$)/);
  });

  test('未登入時保留 /join 深連結供登入後回跳', async ({ anonymousPage }) => {
    // dev server 有 StrictMode，Join 的 effect 會跑兩次；第二次時網址已經是 /login，
    // 這裡守的是深連結不會被 /login 蓋掉。
    await anonymousPage.goto(`/join?code=${CODE}`);

    await expect(anonymousPage).toHaveURL(/\/login(\?|$)/);
    const saved = await anonymousPage.evaluate(() => sessionStorage.getItem('CARE_REDIRECT_URL'));
    expect(saved).toContain(`/join?code=${CODE}`);
  });

  test('驗證中顯示等待畫面，驗證後預覽邀請人並可接受', async ({ authedPage }) => {
    await stubApi(authedPage, {
      path: `/api/family/invites/verify/${CODE}`,
      delayMs: 800,
      body: INVITER,
    });
    const accepts = await stubApi(authedPage, {
      path: '/api/family/invites/accept',
      method: 'POST',
      body: { status: 'joined' },
    });
    await stubApi(authedPage, {
      path: '/api/family/me',
      body: { family_tree: { user_id: 'x', family_members: [], created_at: '', updated_at: '' } },
    });

    await authedPage.goto(`/join?code=${CODE}`);

    await expect(authedPage.getByText(t('family.join.processing'))).toBeVisible();
    await expect(authedPage.getByText(t('family.join.title'))).toBeVisible({ timeout: 5000 });
    await expect(authedPage.getByText(INVITER.inviter_display_name)).toBeVisible();

    await authedPage.getByRole('button', { name: t('family.join.accept') }).click();

    await expect(authedPage.getByText(t('family.join.successTitle'))).toBeVisible();
    expect(accepts[0].body).toEqual({ code: CODE });
    // 成功後 1.5 秒自動導向家庭頁
    await expect(authedPage).toHaveURL(/\/family$/, { timeout: 5000 });
  });

  test('已是成員時顯示提示與前往家族頁面的按鈕', async ({ authedPage }) => {
    await stubApi(authedPage, { path: `/api/family/invites/verify/${CODE}`, body: INVITER });
    await stubApi(authedPage, {
      path: '/api/family/invites/accept',
      method: 'POST',
      body: { status: 'already_member' },
    });
    await stubApi(authedPage, {
      path: '/api/family/me',
      body: { family_tree: { user_id: 'x', family_members: [], created_at: '', updated_at: '' } },
    });

    await authedPage.goto(`/join?code=${CODE}`);
    await authedPage.getByRole('button', { name: t('family.join.accept') }).click();

    await expect(authedPage.getByText(t('family.join.alreadyMemberTitle'))).toBeVisible();
    await authedPage.getByRole('button', { name: t('family.join.goFamily') }).click();
    await expect(authedPage).toHaveURL(/\/family$/);
  });

  test('邀請碼過期（410）顯示失效訊息', async ({ authedPage }) => {
    await stubApi(authedPage, {
      path: `/api/family/invites/verify/${CODE}`,
      status: 410,
      body: { detail: '邀請已失效' },
    });

    await authedPage.goto(`/join?code=${CODE}`);

    await expect(authedPage.getByText(t('family.join.invalidTitle'))).toBeVisible();
    await expect(authedPage.getByText(t('family.join.expired'))).toBeVisible();
  });

  test('接受失敗時顯示後端錯誤訊息', async ({ authedPage }) => {
    await stubApi(authedPage, { path: `/api/family/invites/verify/${CODE}`, body: INVITER });
    await stubApi(authedPage, {
      path: '/api/family/invites/accept',
      method: 'POST',
      status: 409,
      body: { detail: '無法加入自己的家族' },
    });

    await authedPage.goto(`/join?code=${CODE}`);
    await authedPage.getByRole('button', { name: t('family.join.accept') }).click();

    await expect(authedPage.getByText('無法加入自己的家族')).toBeVisible();
  });

  test('預覽畫面按取消回首頁', async ({ authedPage }) => {
    await stubApi(authedPage, { path: `/api/family/invites/verify/${CODE}`, body: INVITER });

    await authedPage.goto(`/join?code=${CODE}`);
    await authedPage.getByRole('button', { name: t('family.join.cancel') }).click();

    await expect(authedPage).toHaveURL(/\/$/);
  });
});

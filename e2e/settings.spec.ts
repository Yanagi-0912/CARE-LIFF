import type { Page } from '@playwright/test';

import { messages } from '../src/i18n/messages';
import { expect, t, test } from './fixtures';
import { stubSettings } from './stubs';

/**
 * 設定頁：伺服器設定覆蓋本機、字級／語言／高對比／通知／語音每一項的
 * 即時生效與 PATCH 契約、API 失敗時退回本機設定。
 */

async function openPage(page: Page) {
  await page.goto('/settings');
  // 「語言設定」「通知設定」也含「設定」二字，要 exact
  await expect(page.getByRole('heading', { name: t('settings.title'), exact: true })).toBeVisible();
}

const rootFontSize = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
const rootHasClass = (page: Page, cls: string) =>
  page.evaluate((c) => document.documentElement.classList.contains(c), cls);
const storedSettings = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('care-settings') ?? '{}'));

test.describe('設定同步', () => {
  test('掛載時以伺服器設定覆蓋本機：字級、高對比、語言都跟著變', async ({ authedPage }) => {
    await stubSettings(authedPage, {
      font_size: 'xlarge',
      high_contrast: false,
      language: 'en',
      voice_rate: 'slow',
    });
    // 不用 openPage：語言會立刻切成英文，中文標題只閃一下
    await authedPage.goto('/settings');

    await expect.poll(() => rootFontSize(authedPage)).toBe('24px');
    await expect.poll(() => rootHasClass(authedPage, 'high-contrast')).toBe(false);
    // 語言換成英文後，標題會是英文文案
    await expect(
      authedPage.getByRole('heading', { name: messages.en['settings.title'], exact: true }),
    ).toBeVisible();
    await expect(
      authedPage.getByRole('group', { name: messages.en['settings.voiceRateLabel'] })
        .getByRole('button', { name: messages.en['settings.voiceRateSlow'] }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('伺服器設定讀取失敗時仍以本機設定渲染', async ({ authedPage }) => {
    await stubSettings(authedPage, {}, { status: 500 });
    await openPage(authedPage);

    // 預設字級 large = 20px
    await expect.poll(() => rootFontSize(authedPage)).toBe('20px');
    await expect(authedPage.getByRole('switch').first()).toBeVisible();
  });
});

test.describe('各項設定', () => {
  test('字級切換即時套用到 html、寫入 localStorage 並 PATCH 後端', async ({ authedPage }) => {
    const { patches } = await stubSettings(authedPage);
    await openPage(authedPage);

    const group = authedPage.getByRole('group', { name: t('settings.fontSizeTitle') });
    await group.getByRole('button', { name: t('settings.fontSizeNormal') }).click();

    await expect.poll(() => rootFontSize(authedPage)).toBe('16px');
    await expect.poll(() => patches.map((c) => c.body)).toContainEqual({ font_size: 'normal' });
    expect((await storedSettings(authedPage)).fontSize).toBe('normal');

    await group.getByRole('button', { name: t('settings.fontSizeXLarge') }).click();
    await expect.poll(() => rootFontSize(authedPage)).toBe('24px');
  });

  test('切換語言後整頁換語言並持久化', async ({ authedPage }) => {
    const { patches } = await stubSettings(authedPage);
    await openPage(authedPage);

    await authedPage.locator('#language-select').click();
    await authedPage.getByRole('option', { name: 'Bahasa Indonesia' }).click();

    await expect(
      authedPage.getByRole('heading', { name: messages.id['settings.title'], exact: true }),
    ).toBeVisible();
    await expect.poll(() => patches.map((c) => c.body)).toContainEqual({ language: 'id' });
    expect((await storedSettings(authedPage)).language).toBe('id');

    // 重新整理後仍是印尼語
    await authedPage.reload();
    await expect(
      authedPage.getByRole('heading', { name: messages.id['settings.title'], exact: true }),
    ).toBeVisible();
  });

  test('高對比開關即時掛上／拿掉 html.high-contrast 並 PATCH', async ({ authedPage }) => {
    const { patches } = await stubSettings(authedPage, { high_contrast: true });
    await openPage(authedPage);

    const toggle = authedPage.getByRole('switch', {
      name: t('settings.toggleAria', { label: t('settings.highContrastToggle') }),
    });
    await expect(toggle).toBeChecked();
    await toggle.click();

    await expect(toggle).not.toBeChecked();
    await expect.poll(() => rootHasClass(authedPage, 'high-contrast')).toBe(false);
    await expect.poll(() => patches.map((c) => c.body)).toContainEqual({ high_contrast: false });
  });

  test('通知與語音開關各自送出對應的 snake_case 欄位', async ({ authedPage }) => {
    const { patches } = await stubSettings(authedPage);
    await openPage(authedPage);

    const rows: Array<[string, string]> = [
      ['settings.medicationReminder', 'notify_reminder'],
      ['settings.familyAlert', 'notify_family'],
      ['settings.voiceReplyToggle', 'voice_reply_enabled'],
    ];
    for (const [labelKey, field] of rows) {
      const toggle = authedPage.getByRole('switch', {
        name: t('settings.toggleAria', { label: t(labelKey) }),
      });
      const before = await toggle.isChecked();
      await toggle.click();
      await expect(toggle).toBeChecked({ checked: !before });
      await expect.poll(() => patches.map((c) => c.body)).toContainEqual({ [field]: !before });
    }
  });

  test('語速與音色為互斥單選，選取後 PATCH 對應值', async ({ authedPage }) => {
    const { patches } = await stubSettings(authedPage);
    await openPage(authedPage);

    const rate = authedPage.getByRole('group', { name: t('settings.voiceRateLabel') });
    await rate.getByRole('button', { name: t('settings.voiceRateFast') }).click();
    await expect(rate.getByRole('button', { name: t('settings.voiceRateFast') })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(rate.getByRole('button', { name: t('settings.voiceRateNormal') })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect.poll(() => patches.map((c) => c.body)).toContainEqual({ voice_rate: 'fast' });

    const gender = authedPage.getByRole('group', { name: t('settings.voiceGenderLabel') });
    await gender.getByRole('button', { name: t('settings.voiceGenderMale') }).click();
    await expect.poll(() => patches.map((c) => c.body)).toContainEqual({ voice_gender: 'male' });
  });

  test('PATCH 失敗不會中斷畫面操作，設定仍在本機生效', async ({ authedPage }) => {
    await stubSettings(authedPage);
    await authedPage.route(
      (url) => url.pathname === '/api/profiles/me/settings',
      async (route) => {
        if (route.request().method() !== 'PATCH') return route.fallback();
        await route.fulfill({ status: 500, body: '{}', contentType: 'application/json' });
      },
    );
    await openPage(authedPage);

    await authedPage
      .getByRole('group', { name: t('settings.fontSizeTitle') })
      .getByRole('button', { name: t('settings.fontSizeNormal') })
      .click();

    await expect.poll(() => rootFontSize(authedPage)).toBe('16px');
    expect((await storedSettings(authedPage)).fontSize).toBe('normal');
  });
});

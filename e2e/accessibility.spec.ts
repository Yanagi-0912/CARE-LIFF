import type { Page } from '@playwright/test';

import { expect, seedLiffMock, t, test } from './fixtures';

/**
 * 高齡可讀性守門。
 *
 * 這一支守的是 .claude/skills/care-frontend/SKILL.md §2「高齡可讀性硬底線」
 * 與 §9 自檢清單裡四條「要實際看過才算數」的項目：
 *   - 新增的可點元素都 ≥ 44px
 *   - 字級 16 / 20 / 24px 三檔都不破版
 *   - 四種主題組合（light / dark / high-contrast / hc+dark）都看過
 *   - 手機直式 375px 與 768px 以上都檢查過
 *
 * 為什麼非得用 Playwright：vitest 跑的 jsdom 沒有排版引擎，
 * getBoundingClientRect() 永遠回傳 0，CSS 媒體查詢與 rem 換算也不會發生。
 * 這幾條規則只有真瀏覽器量得到，而在此之前完全沒有自動化把關。
 */

/** 要巡的頁面。API 都被 fixture 擋成 404，所以看到的是空狀態，這正是最常見的初次使用畫面。 */
const PAGES = [
  '/',
  '/personalhealth',
  '/medications',
  '/family',
  '/settings',
  '/knowledge-reports',
] as const;

/** 設定頁的三段字級，對應 lib/settings.ts 的 fontSizeMap */
const FONT_SIZES = ['normal', 'large', 'xlarge'] as const;

/** 四種主題組合。dark 走 next-themes 的 care-theme，high-contrast 走設定頁。 */
const THEMES = [
  { name: 'light', dark: false, highContrast: false },
  { name: 'dark', dark: true, highContrast: false },
  { name: 'high-contrast', dark: false, highContrast: true },
  { name: 'high-contrast + dark', dark: true, highContrast: true },
] as const;

/** 高齡可讀性底線：觸控目標最小邊長（px） */
const MIN_TOUCH_TARGET = 44;

/** 視為「可點元素」的選擇器。openPage 等它出現，量測時也掃它。 */
const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="switch"]',
  '[role="tab"]',
].join(',');

type AppState = {
  fontSize?: (typeof FONT_SIZES)[number];
  dark?: boolean;
  highContrast?: boolean;
};

/**
 * 在頁面腳本執行前寫入設定，App 掛載時就是目標狀態。
 * 用 goto 後再切的話會先閃一次預設值，量到的是切換過程中的中間值。
 */
async function applyAppState(page: Page, state: AppState) {
  await page.addInitScript((s: AppState) => {
    const raw = localStorage.getItem('care-settings');
    const current = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    localStorage.setItem(
      'care-settings',
      JSON.stringify({
        ...current,
        language: 'zh-TW',
        ...(s.fontSize ? { fontSize: s.fontSize } : {}),
        ...(s.highContrast === undefined ? {} : { highContrast: s.highContrast }),
      }),
    );
    if (s.dark !== undefined) {
      localStorage.setItem('care-theme', s.dark ? 'dark' : 'light');
    }
  }, state);
}

/**
 * 量測畫面上每個可點元素的「實際可點範圍」。
 *
 * 兩個必須處理的細節，少了任何一個結論都會是錯的：
 *
 * 1. 偽元素撐出來的點擊區。Switch 的軌道本身只有 28px，但它用
 *    `after:-inset-y-2` 蓋出一層 44px 的透明命中區。只量元素自己的
 *    border-box 會誤判成違規。
 * 2. 視覺隱藏的原生 input。Base UI 的 Switch／Select 會塞一個
 *    `clip-path: inset(50%)` + aria-hidden 的 1x1 input 給表單提交用，
 *    那不是使用者點的東西，要排除。
 */
async function findSmallTouchTargets(page: Page, min: number) {
  return page.evaluate(({ minSize, selector }) => {

    /** 把偽元素撐出來的命中區加回去 */
    const hitArea = (el: Element, rect: DOMRect) => {
      let { width, height } = rect;
      for (const pseudo of ['::before', '::after']) {
        const cs = getComputedStyle(el, pseudo);
        if (cs.content === 'none' || cs.position !== 'absolute') continue;
        if (cs.pointerEvents === 'none') continue;
        const px = (v: string) => (v.endsWith('px') ? parseFloat(v) : 0);
        const growX = -(px(cs.left) + px(cs.right));
        const growY = -(px(cs.top) + px(cs.bottom));
        if (growX > 0) width += growX;
        if (growY > 0) height += growY;
      }
      return { width, height };
    };

    const violations: Array<{ label: string; width: number; height: number }> = [];
    // 掃到幾個「主要內容區裡的」可點元素。頁面是 lazy 載入的，若還停在
    // Suspense fallback，這個數字會是 0 —— 用它擋掉「什麼都沒量到卻全綠」。
    let scannedInMain = 0;
    const main = document.querySelector('main');

    for (const el of Array.from(document.querySelectorAll(selector))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
      // 視覺隱藏的表單代理元素，不是使用者點的東西
      if (el.getAttribute('aria-hidden') === 'true') continue;
      if (cs.clipPath !== 'none') continue;

      if (main?.contains(el)) scannedInMain += 1;

      const hit = hitArea(el, rect);
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 20);
      const label = text || el.getAttribute('aria-label') || `<${el.tagName.toLowerCase()}>`;
      // 純圖示按鈕寬度同樣要夠；有文字的元素寬度由內容決定，只看高度
      const tooSmall = hit.height < minSize || (!text && hit.width < minSize);

      if (tooSmall) {
        violations.push({
          label,
          width: Math.round(hit.width),
          height: Math.round(hit.height),
        });
      }
    }
    return { violations, scannedInMain };
  }, { minSize: min, selector: INTERACTIVE_SELECTOR });
}

/**
 * 開啟頁面並等到「內容真的畫出來」。
 *
 * 這一步不能省。所有頁面都是 React.lazy 切出去的，Suspense fallback 還在時
 * <main> 就已經可見了——那個時間點量觸控目標或版面寬度，會得到一片乾淨的
 * 假綠燈。（本 spec 第一版就是這樣，把已知的違規全部放過去了。）
 */
async function openPage(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole('main')).toBeVisible();
  // fallback 是 <div role="status" aria-label="載入中">，消失代表頁面元件已掛載
  await expect(page.getByRole('status', { name: t('common.loading') })).toHaveCount(0);
  // 元件掛載 ≠ 內容畫好：像 /family 的空狀態要等 TanStack Query 的請求落地才出現，
  // 這中間量到的是「還沒有東西」的畫面。等到第一個可互動元素為止。
  await expect(
    page.getByRole('main').locator(INTERACTIVE_SELECTOR).first(),
  ).toBeVisible();
}

/** 版面有沒有橫向溢出。手機上橫向捲動等於內容被切掉。 */
async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    return de.scrollWidth - de.clientWidth;
  });
}

function describeViolations(list: Array<{ label: string; width: number; height: number }>) {
  return list.map((v) => `「${v.label}」${v.width}x${v.height}`).join('、');
}

/**
 * 守門機制的自我檢查。
 *
 * 上面那些測試全綠，可能是因為畫面真的合規，也可能是因為偵測器壞了什麼都抓不到。
 * 這一條把三種已知情形塞進真實頁面，確認偵測器分得出來——
 * 沒有它，整支 spec 有可能靜悄悄地變成空轉。
 */
test.describe('守門機制自我檢查', () => {
  test('偵測器抓得到過小的元素，且不誤報合規的', async ({ authedPage }) => {
    await authedPage.goto('/');
    await expect(authedPage.getByRole('main')).toBeVisible();

    await authedPage.evaluate(() => {
      const style = document.createElement('style');
      // 模擬 Switch 的手法：本體只有 28px，靠 ::after 蓋出 44px 的命中區
      style.textContent = `
        #probe-pseudo::after {
          content: '';
          position: absolute;
          top: -8px; bottom: -8px; left: -8px; right: -8px;
        }`;
      document.head.append(style);

      const host = document.createElement('div');
      host.id = 'probe-host';
      const add = (id: string, width: number, height: number) => {
        const btn = document.createElement('button');
        btn.id = id;
        btn.setAttribute('aria-label', id);
        btn.style.cssText = `position:relative;width:${width}px;height:${height}px`;
        host.append(btn);
      };
      add('probe-too-small', 20, 20);
      add('probe-ok-44', 44, 44);
      add('probe-pseudo', 28, 28);
      document.body.append(host);
    });

    const labels = (
      await findSmallTouchTargets(authedPage, MIN_TOUCH_TARGET)
    ).violations.map((v) => v.label);

    expect(labels).toContain('probe-too-small');
    expect(labels).not.toContain('probe-ok-44');
    // 偽元素撐出來的命中區要算進去，否則 Switch 這類元件會被誤判成違規
    expect(labels).not.toContain('probe-pseudo');
  });
});

test.describe('觸控目標 ≥ 44px', () => {
  for (const path of PAGES) {
    for (const fontSize of FONT_SIZES) {
      test(`${path} 在字級 ${fontSize} 下所有可點元素都夠大`, async ({ authedPage }) => {
        await seedLiffMock(authedPage, { isLoggedIn: true });
        await applyAppState(authedPage, { fontSize });

        await openPage(authedPage, path);

        const { violations, scannedInMain } = await findSmallTouchTargets(
          authedPage,
          MIN_TOUCH_TARGET,
        );

        // 先確認真的量到頁面內容，否則下面那句「沒有違規」毫無意義
        expect(scannedInMain, `${path} 沒有量到任何可點元素，頁面可能還沒載完`)
          .toBeGreaterThan(0);
        expect(violations, describeViolations(violations)).toEqual([]);
      });
    }
  }
});

test.describe('字級 16 / 20 / 24px 都不破版', () => {
  for (const path of PAGES) {
    for (const fontSize of FONT_SIZES) {
      test(`${path} 在字級 ${fontSize} 下不橫向溢出`, async ({ authedPage }) => {
        await seedLiffMock(authedPage, { isLoggedIn: true });
        await applyAppState(authedPage, { fontSize });

        await openPage(authedPage, path);

        const { scannedInMain } = await findSmallTouchTargets(authedPage, MIN_TOUCH_TARGET);
        expect(scannedInMain, `${path} 頁面可能還沒載完`).toBeGreaterThan(0);
        expect(await horizontalOverflow(authedPage)).toBe(0);
      });
    }
  }

  test('字級設定真的會改變 html 的 font-size', async ({ authedPage }) => {
    const expected = { normal: '16px', large: '20px', xlarge: '24px' } as const;

    for (const fontSize of FONT_SIZES) {
      await applyAppState(authedPage, { fontSize });
      await openPage(authedPage, '/');

      await expect
        .poll(() =>
          authedPage.evaluate(() => getComputedStyle(document.documentElement).fontSize),
        )
        .toBe(expected[fontSize]);
    }
  });
});

test.describe('四種主題組合', () => {
  for (const theme of THEMES) {
    test(`${theme.name}：正常渲染、不溢出、且背景與文字都有實色`, async ({ authedPage }) => {
      await seedLiffMock(authedPage, { isLoggedIn: true });
      await applyAppState(authedPage, {
        fontSize: 'xlarge',
        dark: theme.dark,
        highContrast: theme.highContrast,
      });

      await openPage(authedPage, '/settings');

      // 主題確實掛上去了
      const classes = await authedPage.evaluate(() => document.documentElement.className);
      expect(classes.includes('dark')).toBe(theme.dark);
      expect(classes.includes('high-contrast')).toBe(theme.highContrast);

      expect(await horizontalOverflow(authedPage)).toBe(0);

      // 背景透明代表 token 沒接上，畫面會借用宿主底色，深色下常變成白底黑字閃一下
      const colors = await authedPage.evaluate(() => {
        const cs = getComputedStyle(document.body);
        return { background: cs.backgroundColor, color: cs.color };
      });
      expect(colors.background).not.toBe('rgba(0, 0, 0, 0)');
      expect(colors.background).not.toBe('transparent');
      expect(colors.color).not.toBe('rgba(0, 0, 0, 0)');
    });
  }

  test('高對比選項會即時掛上 html.high-contrast', async ({ authedPage }) => {
    await seedLiffMock(authedPage, { isLoggedIn: true });
    await applyAppState(authedPage, { highContrast: false });
    await openPage(authedPage, '/settings');

    const toggle = authedPage.getByRole('switch').first();
    await expect(toggle).toBeVisible();

    await expect
      .poll(() => authedPage.evaluate(() => document.documentElement.classList.contains('high-contrast')))
      .toBe(false);

    await toggle.click();

    await expect
      .poll(() => authedPage.evaluate(() => document.documentElement.classList.contains('high-contrast')))
      .toBe(true);
  });
});

test.describe('手機直式與桌面版面', () => {
  // 規範 §9：375px 手機直式與 768px 以上都要檢查
  const VIEWPORTS = [
    { name: '手機直式 375px', width: 375, height: 667 },
    { name: '平板／桌面 768px', width: 768, height: 1024 },
    { name: '桌面 1280px', width: 1280, height: 900 },
  ] as const;

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}：字級最大時首頁與設定頁都不溢出`, async ({ authedPage }) => {
      await authedPage.setViewportSize({ width: viewport.width, height: viewport.height });
      await seedLiffMock(authedPage, { isLoggedIn: true });
      await applyAppState(authedPage, { fontSize: 'xlarge', highContrast: true });

      for (const path of ['/', '/settings'] as const) {
        await openPage(authedPage, path);
        expect(await horizontalOverflow(authedPage), `${path} 在 ${viewport.name} 溢出`).toBe(0);
      }
    });
  }

  test('手機顯示底部導覽、桌面顯示側欄，兩者不同時出現', async ({ authedPage }) => {
    await seedLiffMock(authedPage, { isLoggedIn: true });
    await authedPage.setViewportSize({ width: 375, height: 667 });
    await authedPage.goto('/');

    await expect(authedPage.getByRole('navigation', { name: '主要導覽' })).toBeVisible();
    await expect(authedPage.getByRole('complementary')).toBeHidden();

    await authedPage.setViewportSize({ width: 1280, height: 900 });
    await expect(authedPage.getByRole('complementary')).toBeVisible();
    await expect(authedPage.getByRole('navigation', { name: '主要導覽' })).toBeHidden();
  });
});

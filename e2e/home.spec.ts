import { expect, stubProfileApi, t, test } from './fixtures';

/**
 * 首頁功能卡片。
 *
 * 卡片文案與側欄／底部導覽高度重複（「家庭」「設定」…），
 * 所以一律先收斂到 [data-testid="home-features"] 再找按鈕，
 * 否則 getByRole 會同時命中導覽列。
 */

/** 一般使用者看得到的八張卡片，順序即畫面順序 */
const FEATURE_CARDS = [
  { titleKey: 'home.nearbyHospitals', descKey: 'home.nearbyHospitalsDesc', path: '/nearby-hospitals' },
  { titleKey: 'home.personalHealth', descKey: 'home.personalHealthDesc', path: '/personalhealth' },
  { titleKey: 'home.healthRecords', descKey: 'home.healthRecordsDesc', path: '/health-records' },
  { titleKey: 'home.medications', descKey: 'home.medicationsDesc', path: '/reminders/medications' },
  { titleKey: 'home.appointments', descKey: 'home.appointmentsDesc', path: '/reminders/appointments' },
  { titleKey: 'home.clinicVisits', descKey: 'home.clinicVisitsDesc', path: '/clinic-visits' },
  { titleKey: 'home.family', descKey: 'home.familyDesc', path: '/family' },
  { titleKey: 'home.knowledgeReports', descKey: 'home.knowledgeReportsDesc', path: '/knowledge-reports' },
  { titleKey: 'home.settings', descKey: 'home.settingsDesc', path: '/settings' },
] as const;

test.describe('首頁 (Home)', () => {
  test.beforeEach(async ({ authedPage }) => {
    await authedPage.goto('/');
  });

  test('顯示標題與引導說明', async ({ authedPage }) => {
    await expect(
      authedPage.getByRole('heading', { name: t('home.title'), level: 1 }),
    ).toBeVisible();
    await expect(authedPage.getByText(t('home.subtitle'))).toBeVisible();
  });

  test('渲染八張功能卡片，標題與描述都正確', async ({ authedPage }) => {
    const features = authedPage.getByTestId('home-features');
    const cards = features.getByRole('button');

    await expect(cards).toHaveCount(FEATURE_CARDS.length);

    for (const [index, card] of FEATURE_CARDS.entries()) {
      const item = cards.nth(index);
      await expect(item).toContainText(t(card.titleKey));
      await expect(item).toContainText(t(card.descKey));
    }
  });

  for (const card of FEATURE_CARDS) {
    test(`點擊「${card.titleKey}」卡片導向 ${card.path}`, async ({ authedPage }) => {
      await authedPage
        .getByTestId('home-features')
        // 用「標題 + 描述」而不是只用標題：卡片的無障礙名稱是兩者相接，而標題
        // 可能出現在別張卡片的描述裡（「個人健康」的描述就含「健康紀錄」），
        // 只比對標題會同時命中兩張而觸發 strict mode。
        .getByRole('button', { name: `${t(card.titleKey)} ${t(card.descKey)}`, exact: false })
        .click();

      await expect(authedPage).toHaveURL(new RegExp(`${card.path}$`));
    });
  }

  test('管理員多看到一張知識審核卡片', async ({ authedPage }) => {
    // 後註冊的 route 會蓋掉 fixture 的預設 stub
    await stubProfileApi(authedPage, { name: '管理員', role: 'admin' });
    await authedPage.reload();

    const features = authedPage.getByTestId('home-features');
    await expect(features.getByRole('button')).toHaveCount(FEATURE_CARDS.length + 1);
    await expect(features).toContainText(t('home.adminKnowledgeReports'));
  });

  test('一般使用者看不到知識審核卡片', async ({ authedPage }) => {
    await expect(authedPage.getByTestId('home-features')).not.toContainText(
      t('home.adminKnowledgeReports'),
    );
  });
});

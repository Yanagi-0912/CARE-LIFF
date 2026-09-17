import { LINE_USER_ID, expect, t, test } from './fixtures';
import { FULL_PERMISSIONS, NO_PERMISSIONS, stubApi, stubFamily } from './stubs';

/**
 * 看診錄音清單：選單入口、替誰看（嚴格判定的 SENSITIVE）、開始錄音的網址、
 * 清單點進檢視頁要帶對象。
 *
 * 錄音本身要真的麥克風，不在這裡；錄音頁只驗從清單進去時有沒有帶對象。
 */

const ELDER = 'Ufamily00000000000000000000000001';
const CAREGIVER_OF = 'Ufamily00000000000000000000000003';

const READ_ONLY_SENSITIVE = { general: ['READ'], sensitive: ['READ'], private: [] } as const;

/** 三種家人：能看能錄、只能看、影子模式下看起來有權限但嚴格判定沒有 */
const MEMBERS = [
  {
    user_id: ELDER,
    relationship_type: 'parent',
    display_name: '林阿嬤',
    family_role: 'GUARDIAN',
    my_role: 'GUARDIAN',
    my_permissions: FULL_PERMISSIONS,
    my_strict_permissions: FULL_PERMISSIONS,
  },
  {
    user_id: CAREGIVER_OF,
    relationship_type: 'parent',
    display_name: '陳阿公',
    family_role: 'CAREGIVER',
    my_role: 'CAREGIVER',
    my_permissions: READ_ONLY_SENSITIVE,
    my_strict_permissions: READ_ONLY_SENSITIVE,
  },
  {
    user_id: 'Ufamily00000000000000000000000002',
    relationship_type: null,
    display_name: '王小明',
    family_role: null,
    my_role: 'MEMBER',
    my_permissions: FULL_PERMISSIONS,
    my_strict_permissions: NO_PERMISSIONS,
  },
];

function record(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'rec-1',
    user_id: LINE_USER_ID,
    created_by_user_id: LINE_USER_ID,
    appointment_id: null,
    hospital_name: '臺大醫院',
    department: '心臟內科',
    consent: 'doctor_agreed',
    status: 'ready',
    failure_reason: '',
    recorded_at: '2026-09-17T02:30:00Z',
    segments: [{ text: '血壓控制得不錯', start_seconds: 0 }],
    summary: {
      main_points: ['血壓控制得不錯'],
      medication_changes: [],
      next_visit: '',
      reminders: [],
      unclear: [],
      truncated: false,
    },
    drug_hints: [],
    ...overrides,
  };
}

test.describe('看診錄音清單', () => {
  test.beforeEach(async ({ authedPage }) => {
    await stubFamily(authedPage, MEMBERS);
  });

  test('首頁卡片進得來，本人可以開始錄音', async ({ authedPage }) => {
    await stubApi(authedPage, { path: '/api/clinic-visits', method: 'GET', body: [] });
    await authedPage.goto('/');
    await authedPage
      .getByTestId('home-features')
      .getByRole('button', { name: new RegExp(t('home.clinicVisits')) })
      .click();

    await expect(authedPage).toHaveURL(/\/clinic-visits$/);
    await expect(authedPage.getByRole('heading', { name: t('clinic.title') })).toBeVisible();
    await expect(authedPage.getByText(t('clinic.empty'))).toBeVisible();

    await authedPage.getByRole('button', { name: t('clinic.startRecording') }).click();
    await expect(authedPage).toHaveURL(/\/clinic-visits\/record$/);
    await expect(authedPage.getByText(t('clinic.consent.heading'))).toBeVisible();
  });

  test('對象只列嚴格判定下看得到的家人', async ({ authedPage }) => {
    await stubApi(authedPage, { path: '/api/clinic-visits', method: 'GET', body: [] });
    await authedPage.goto('/clinic-visits');

    const group = authedPage.getByRole('group', { name: t('clinic.targetLabel') });
    await expect(group.getByText('林阿嬤')).toBeVisible();
    await expect(group.getByText('陳阿公')).toBeVisible();
    // 影子模式下 my_permissions 看起來有 SENSITIVE，但後端嚴格判定會 403
    await expect(group.getByText('王小明')).toHaveCount(0);
  });

  test('只有讀取權的家人看得到清單但沒有錄音按鈕', async ({ authedPage }) => {
    const calls = await stubApi(authedPage, {
      path: '/api/clinic-visits',
      method: 'GET',
      body: [record({ user_id: CAREGIVER_OF })],
    });
    await authedPage.goto('/clinic-visits');
    await authedPage.getByRole('group', { name: t('clinic.targetLabel') }).getByText('陳阿公').click();

    await expect(
      authedPage.getByRole('heading', { name: t('clinic.titleForMember', { name: '陳阿公' }) }),
    ).toBeVisible();
    await expect.poll(() => calls.some((c) => c.url.searchParams.get('target_user_id') === CAREGIVER_OF)).toBe(true);
    await expect(authedPage.getByRole('button', { name: t('clinic.startRecording') })).toHaveCount(0);
  });

  test('替能錄的家人錄音時網址帶對象，點紀錄進檢視頁也帶對象', async ({ authedPage }) => {
    await stubApi(authedPage, {
      path: '/api/clinic-visits',
      method: 'GET',
      body: [record({ user_id: ELDER })],
    });
    await stubApi(authedPage, {
      path: '/api/clinic-visits/rec-1',
      method: 'GET',
      body: record({ user_id: ELDER }),
    });
    await authedPage.goto('/clinic-visits');
    await authedPage.getByRole('group', { name: t('clinic.targetLabel') }).getByText('林阿嬤').click();

    await authedPage.getByRole('button', { name: t('clinic.startRecording') }).click();
    await expect(authedPage).toHaveURL(new RegExp(`/clinic-visits/record\\?target_user_id=${ELDER}$`));
    await authedPage.goBack();
    await authedPage.getByRole('group', { name: t('clinic.targetLabel') }).getByText('林阿嬤').click();

    await authedPage.getByRole('button', { name: /臺大醫院/ }).click();
    await expect(authedPage).toHaveURL(new RegExp(`/clinic-visits/rec-1\\?target_user_id=${ELDER}$`));
    await expect(authedPage.getByText(t('clinic.summary.main'))).toBeVisible();

    await authedPage.getByRole('button', { name: t('clinic.backToList') }).click();
    await expect(authedPage).toHaveURL(new RegExp(`/clinic-visits\\?target_user_id=${ELDER}$`));
  });

  test('清單顯示狀態，整理中會自己重抓', async ({ authedPage }) => {
    let n = 0;
    await stubApi(authedPage, {
      path: '/api/clinic-visits',
      method: 'GET',
      respond: () => {
        n += 1;
        return {
          status: 200,
          body: [record({ status: n === 1 ? 'processing' : 'ready' })],
        };
      },
    });
    await authedPage.goto('/clinic-visits');
    await expect(authedPage.getByText(t('clinic.status.processing'))).toBeVisible();
    await expect(authedPage.getByText(t('clinic.status.ready'))).toBeVisible({ timeout: 10_000 });
  });

  test('讀取失敗給重新載入', async ({ authedPage }) => {
    await stubApi(authedPage, { path: '/api/clinic-visits', method: 'GET', status: 500, body: {} });
    await authedPage.goto('/clinic-visits');
    await expect(authedPage.getByText(t('clinic.list.loadError'))).toBeVisible();
    await expect(authedPage.getByRole('button', { name: t('clinic.list.retry') })).toBeVisible();
  });
});

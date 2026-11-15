import { expect, LINE_USER_ID, t, test } from './fixtures';
import { FAMILY_MEMBERS, FULL_PERMISSIONS, stubApi, stubFamily } from './stubs';
import type { CareTask, NewCareTask } from '../src/api/longTermCareApi';

const path = '/api/long-term-care/tasks';

test('family member creates a task from a LINE guide and advances it', async ({ authedPage: page }) => {
  const patient = { ...FAMILY_MEMBERS[0], my_strict_permissions: FULL_PERMISSIONS };
  await stubFamily(page, [patient]);
  let task: CareTask | undefined;
  await stubApi(page, {
    path,
    respond: (request) => {
      if (request.method === 'POST') {
        expect(request.url.searchParams.get('target_user_id')).toBe(patient.user_id);
        const newTask = request.body as NewCareTask;
        expect(newTask.topic).toBe('respite');
        expect(newTask.remind_at).toBe('2030-07-15T01:00:00.000Z');
        task = { ...newTask, creator_id: LINE_USER_ID, status: 'assigned', updated_at: new Date().toISOString() };
        return { status: 200, body: task };
      }
      return {
        status: 200,
        body: { tasks: task ? [task] : [], assignees: [{ id: LINE_USER_ID, name: null }] },
      };
    },
  });
  await stubApi(page, {
    path: /\/api\/long-term-care\/tasks\/[^/]+$/,
    method: 'PATCH',
    respond: ({ body }) => {
      if (!task) return { status: 404 };
      task = { ...task, status: (body as Pick<CareTask, 'status'>).status };
      return { status: 200, body: task };
    },
  });
  await page.goto('/family/long-term-care?topic=respite');
  await page.getByRole('button', { name: patient.display_name }).click();
  await page.getByRole('switch', { name: t('careTask.reminderOptional') }).click();
  await page.getByLabel(t('careTask.reminderDate'), { exact: true }).fill('2030-07-15');
  await page.getByLabel(t('careTask.reminderTime'), { exact: true }).fill('09:00');
  await page.getByRole('button', { name: t('careTask.save') }).click();
  for (const status of ['accepted', 'contacted', 'done']) {
    await page.getByRole('button', { name: t(`careTask.action.${status}`) }).click();
    await expect(page.getByText(t(`careTask.status.${status}`), { exact: true })).toBeVisible();
  }
  expect(task).toBeDefined();
  await stubApi(page, {
    path: `${path}/${task!.id}/target`,
    body: { target_user_id: patient.user_id },
  });
  await page.goto(`/family/long-term-care?task=${task!.id}`);
  await expect(page.getByText(t('careTask.status.done'), { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: patient.display_name })).toHaveAttribute('aria-pressed', 'true');
});

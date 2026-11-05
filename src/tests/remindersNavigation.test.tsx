import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it } from 'vitest';
import i18n from '../i18n';
import RemindersLayout from '../pages/Reminders';
import { renderWithToaster } from './testUtils';

beforeEach(async () => { await i18n.changeLanguage('zh-TW'); sessionStorage.clear(); });

function renderReminders(path = '/reminders') {
  renderWithToaster(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/reminders" element={<RemindersLayout />}>
      <Route path="medications" element={<h2>用藥表單</h2>} />
      <Route path="appointments" element={<h2>掛號表單</h2>} />
      <Route path="*" element={null} />
    </Route>
  </Routes></MemoryRouter>);
}

it('點底部導覽的提醒直接進入用藥頁，沒有另一層入口頁', async () => {
  renderReminders();
  expect(await screen.findByText('用藥表單')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: '返回' })).not.toBeInTheDocument();
});

it('同一次開啟期間，提醒會回到上次看的子頁', async () => {
  sessionStorage.setItem('care-reminders-last-tab', '/reminders/appointments');
  renderReminders();
  expect(await screen.findByText('掛號表單')).toBeInTheDocument();
});

it('既有掛號深連結與子頁切換仍可操作', async () => {
  renderReminders('/reminders/appointments?from=line');
  expect(screen.getByText('掛號表單')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: i18n.t('reminders.tab.medications'), exact: true }));
  expect(await screen.findByText('用藥表單')).toBeInTheDocument();
});

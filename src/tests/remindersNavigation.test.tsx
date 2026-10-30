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

it('提醒首頁顯示新版兩個入口，不直接跳進上次開啟的表單', async () => {
  sessionStorage.setItem('care-reminders-last-tab', '/reminders/appointments');
  renderReminders();
  expect(screen.getByRole('heading', { level: 1, name: '提醒' })).toBeInTheDocument();
  expect(screen.queryByText('掛號表單')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: /用藥提醒/ }));
  expect(await screen.findByText('用藥表單')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: '返回' }));
  expect(await screen.findByRole('heading', { name: '提醒', exact: true })).toBeInTheDocument();
});

it('既有掛號深連結與子頁切換仍可操作', async () => {
  renderReminders('/reminders/appointments?from=line');
  expect(screen.getByText('掛號表單')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: i18n.t('reminders.tab.medications'), exact: true }));
  expect(await screen.findByText('用藥表單')).toBeInTheDocument();
});

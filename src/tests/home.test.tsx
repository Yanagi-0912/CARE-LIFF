import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithToaster } from './testUtils';
import Home from '../pages/Home';
import i18n from '../i18n';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...await vi.importActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const entries = [
  ['home.nearbyTitle', '/nearby-hospitals'],
  ['home.healthRecords', '/health-records'],
  ['home.clinicVisits', '/clinic-visits'],
  ['home.knowledgeReports', '/knowledge-reports'],
];

describe('首頁服務入口', () => {
  it('提供四項服務，其他功能由主要導覽進入', () => {
    renderWithToaster(<Home />);
    expect(screen.getByRole('heading', { name: i18n.t('home.introTitle') })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it.each(entries)('%s 開啟 %s', (label, path) => {
    renderWithToaster(<Home />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(i18n.t(label)) }));
    expect(mockNavigate).toHaveBeenLastCalledWith(path);
  });
});

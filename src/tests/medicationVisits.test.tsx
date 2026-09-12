import { screen } from '@testing-library/react';
import { renderWithToaster } from './testUtils';
import { describe, expect, it } from 'vitest';
import { VisitList } from '../pages/Medications/Visits/VisitList';
import type { MedicationVisit } from '../types/medication';
import i18n from '../i18n';

const VISIT: MedicationVisit = {
  institution: '臺大醫院',
  dispensed_date: '2026-08-16',
  medication_ids: ['m1', 'm2'],
  medication_names: ['安樂筋錠', '勿炎糖衣錠'],
  scan_count: 3,
  first_created_at: null,
};

function render(props: Partial<Parameters<typeof VisitList>[0]> = {}) {
  return renderWithToaster(
    <VisitList
      visits={props.visits ?? []}
      loading={props.loading ?? false}
      error={props.error ?? null}
      forbidden={props.forbidden ?? false}
    />,
  );
}

describe('VisitList', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('zh-TW');
  });

  it('顯示機構、日期與藥名', () => {
    render({ visits: [VISIT] });

    expect(screen.getByText('臺大醫院')).toBeInTheDocument();
    expect(screen.getByText('2026-08-16')).toBeInTheDocument();
    expect(screen.getByText('安樂筋錠、勿炎糖衣錠')).toBeInTheDocument();
  });

  it('掃描超過一次時主動說明', () => {
    // 實測同一個藥袋在 42 分鐘內被掃了三次。使用者會困惑「我是不是重複加了」，
    // 主動說明比讓他自己發現好。
    render({ visits: [VISIT] });

    expect(screen.getByText(/掃描過 3 次/)).toBeInTheDocument();
  });

  it('只掃描一次時不顯示次數', () => {
    render({ visits: [{ ...VISIT, scan_count: 1 }] });

    expect(screen.queryByText(/掃描過/)).not.toBeInTheDocument();
  });

  it('沒有機構名時標示未記錄來源並說明原因', () => {
    // 留白會讓人以為壞掉。實際原因是那些藥是手動新增的、或建立於欄位落地之前。
    render({ visits: [{ ...VISIT, institution: null, dispensed_date: null }] });

    expect(screen.getByText('未記錄來源')).toBeInTheDocument();
    expect(screen.getByText('未記錄日期')).toBeInTheDocument();
    expect(screen.getByText(/手動新增的藥/)).toBeInTheDocument();
  });

  it('無權限時說明原因，且不給重試', () => {
    // 重試多少次都一樣，給按鈕只會讓人反覆點。
    render({ forbidden: true });

    expect(screen.getByText(/沒有查看這位家人看診紀錄的權限/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重新載入' })).not.toBeInTheDocument();
  });

  it('載入失敗時給重試', () => {
    render({ error: '連線逾時' });

    expect(screen.getByText('取得看診紀錄失敗')).toBeInTheDocument();
    expect(screen.getByText('連線逾時')).toBeInTheDocument();
  });

  it('空清單時告訴使用者怎麼讓資料出現', () => {
    render({ visits: [] });

    expect(screen.getByText(/掃描藥袋加入用藥後/)).toBeInTheDocument();
  });
});

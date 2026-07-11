import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LineSidebar from '../components/LineSidebar/LineSidebar';

describe('LineSidebar', () => {
  it('顯示項目、標記目前頁面並回傳點擊項目', () => {
    const onItemClick = vi.fn();

    render(
      <LineSidebar
        items={['首頁', '個人健康', '知識回報']}
        defaultActive={0}
        onItemClick={onItemClick}
      />,
    );

    expect(screen.getByRole('button', { name: /01\s*首頁/ })).toHaveAttribute(
      'aria-current',
      'page',
    );

    fireEvent.click(screen.getByRole('button', { name: /03\s*知識回報/ }));

    expect(onItemClick).toHaveBeenCalledWith(2, '知識回報');
    expect(screen.getByRole('button', { name: /03\s*知識回報/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

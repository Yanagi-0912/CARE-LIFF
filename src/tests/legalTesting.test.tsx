import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from '@/App';

describe('LegalTestingPage', () => {
  it('renders without requiring LIFF login', async () => {
    window.history.pushState({}, '', '/legal/testing');

    render(<App />);

    expect(await screen.findByRole('heading', { name: '測試版簡易法務與隱私說明' })).toBeInTheDocument();
    expect(screen.getByText('繼續使用即視為同意')).toBeInTheDocument();
    expect(screen.queryByText('正在驗證 LINE 身份資訊…')).not.toBeInTheDocument();
  });
});

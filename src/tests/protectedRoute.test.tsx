import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { isAuthenticated } from '../utils/auth';
import { consumeRedirectUrl, saveRedirectUrl } from '../utils/redirect';

vi.mock('../utils/auth', () => ({
  isAuthenticated: vi.fn(),
}));

/** 與 App.tsx ProtectedRoute 相同行為（深連結保留） */
function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (!isAuthenticated()) {
    const redirect = `${location.pathname}${location.search}`;
    if (redirect && redirect !== '/login') {
      saveRedirectUrl(redirect);
    }
    return <Navigate to="/login" replace />;
  }
  return children;
}

describe('ProtectedRoute deep link redirect', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(isAuthenticated).mockReturnValue(false);
  });

  it('未登入開啟 /settings 時應存下 redirect 並導向 /login', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/login" element={<div>login-page</div>} />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <div>settings-page</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('login-page')).toBeInTheDocument();
    expect(consumeRedirectUrl()).toBe('/settings');
  });
});

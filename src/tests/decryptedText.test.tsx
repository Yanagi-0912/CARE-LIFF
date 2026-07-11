import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DecryptedText from '../components/DecryptedText/DecryptedText';

describe('DecryptedText', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('保留原始文字供螢幕閱讀器讀取', () => {
    render(<DecryptedText text="CARE 健康管家" />);

    expect(
      screen.getByText('CARE 健康管家', { selector: '.decrypted-text__sr-only' }),
    ).toBeInTheDocument();
  });

  it('點擊後依序解密並顯示原始文字', () => {
    vi.useFakeTimers();
    render(
      <DecryptedText
        text="CARE"
        animateOn="click"
        sequential
        speed={10}
        className="decrypted-text__revealed"
        encryptedClassName="decrypted-text__encrypted"
      />,
    );

    const originalText = screen.getByText('CARE', {
      selector: '.decrypted-text__sr-only',
    });
    fireEvent.click(originalText.parentElement!);

    act(() => {
      vi.advanceTimersByTime(60);
    });

    expect(
      originalText.parentElement?.querySelectorAll('.decrypted-text__revealed'),
    ).toHaveLength(4);
  });
});

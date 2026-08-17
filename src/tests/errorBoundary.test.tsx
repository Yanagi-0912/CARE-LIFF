import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../components/ErrorBoundary';
import i18n from '../i18n';

/** 拋出指定訊息的元件，用來模擬 lazy import 失敗與一般的渲染例外。 */
function Boom({ message }: { message: string }): never {
  throw new Error(message);
}

/** 部署後舊 chunk 已被刪除時，瀏覽器實際會拋出的訊息。 */
const CHUNK_ERROR = 'Failed to fetch dynamically imported module: /assets/Family-B4O3yMDm.js';

describe('ErrorBoundary', () => {
  beforeEach(async () => {
    sessionStorage.clear();
    // React 會把被邊界接住的例外也印到 console，測試輸出會很吵；這裡收斂掉，
    // 但仍保留 spy 以便需要時斷言。
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await i18n.changeLanguage('zh-TW');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('子元件正常時原樣呈現，不介入渲染', () => {
    render(
      <ErrorBoundary>
        <p>正常內容</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('正常內容')).toBeInTheDocument();
  });

  it('子元件拋錯時呈現可操作的錯誤畫面，而不是空白', () => {
    render(
      <ErrorBoundary reload={vi.fn()}>
        <Boom message="something went wrong" />
      </ErrorBoundary>,
    );

    expect(screen.getByText(i18n.t('error.boundaryTitle'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('error.reload') })).toBeInTheDocument();
  });

  it('一般渲染例外不自動重載——重載救不了它，只會把使用者關進迴圈', () => {
    const reload = vi.fn();
    render(
      <ErrorBoundary reload={reload}>
        <Boom message="something went wrong" />
      </ErrorBoundary>,
    );

    expect(reload).not.toHaveBeenCalled();
  });

  it('chunk 載入失敗時自動重載一次', () => {
    const reload = vi.fn();
    render(
      <ErrorBoundary reload={reload}>
        <Boom message={CHUNK_ERROR} />
      </ErrorBoundary>,
    );

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('冷卻期內不重複自動重載，改為交給使用者決定', () => {
    // 模擬「剛剛才因為 chunk 失敗重載過」的狀態。
    sessionStorage.setItem('care.chunkReloadAt', String(Date.now()));
    const reload = vi.fn();

    render(
      <ErrorBoundary reload={reload}>
        <Boom message={CHUNK_ERROR} />
      </ErrorBoundary>,
    );

    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: i18n.t('error.reload') })).toBeInTheDocument();
  });

  it('按下重新載入按鈕會觸發重載', () => {
    const reload = vi.fn();
    render(
      <ErrorBoundary reload={reload}>
        <Boom message="something went wrong" />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: i18n.t('error.reload') }));

    expect(reload).toHaveBeenCalledTimes(1);
  });
});

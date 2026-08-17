import { Component, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcwIcon, TriangleAlertIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

/**
 * 動態載入失敗的訊息在各家瀏覽器措辭不同，這裡涵蓋 Chrome／Safari／Firefox
 * 與打包工具各自的說法。判斷寬鬆一點是刻意的：認錯了頂多多重載一次（重載
 * 本來就是這個錯誤唯一的解法），認不出來才會讓使用者卡在錯誤畫面。
 */
const CHUNK_ERROR_PATTERN =
  /dynamically imported module|module script failed|ChunkLoadError|Loading chunk .* failed/i;

/** 自動重載的時間戳，存在 sessionStorage：分頁關掉就消失，不影響下一次開啟。 */
const RELOAD_STAMP_KEY = 'care.chunkReloadAt';

/**
 * 重載後若立刻又失敗，代表問題不是「舊的 chunk 檔名」而是別的東西，
 * 再重載也只是把使用者關進無限迴圈。冷卻期內改為呈現錯誤畫面，把決定權
 * 交還給使用者。
 */
const RELOAD_COOLDOWN_MS = 10_000;

function isChunkLoadError(error: unknown): boolean {
  return error instanceof Error && CHUNK_ERROR_PATTERN.test(error.message);
}

function shouldAutoReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_STAMP_KEY) ?? 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_STAMP_KEY, String(Date.now()));
    return true;
  } catch {
    // 無痕模式等情境下 sessionStorage 可能拋錯。此時寧可不自動重載——
    // 沒有冷卻期就沒有防迴圈的依據，錯誤畫面至少是使用者按得動的。
    return false;
  }
}

/** 文案要跟著語言設定走，而 class 元件不能用 hook，因此拆成獨立的函式元件。 */
function ErrorFallback({ onReload }: { onReload: () => void }) {
  const { t } = useTranslation();

  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TriangleAlertIcon />
        </EmptyMedia>
        <EmptyTitle>{t('error.boundaryTitle')}</EmptyTitle>
        <EmptyDescription>{t('error.boundaryDesc')}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" onClick={onReload}>
          <RotateCcwIcon />
          {t('error.reload')}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 可注入以便測試；預設重新載入整頁。 */
  reload?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * 攔截子樹渲染時拋出的例外，避免整棵樹被卸載成一片白畫面。
 *
 * 為什麼 Suspense 不夠：Suspense 只處理「還在載入」，不處理「載入失敗」。
 * App.tsx 的每個頁面都是 lazy(() => import(...))，各自一個 chunk 檔；每次
 * 部署都會產生新的檔名並刪掉舊的，所以「使用者開著舊版 App、點進一個還沒
 * 載入過的頁面」必然會取到 404——這不是可以修掉的邊界情況，是有部署就會
 * 發生的常態。沒有這道防線時 React 會卸載整棵樹，使用者看到的是純白畫面：
 * 沒有訊息、沒有按鈕，也沒有任何線索指向「重新開啟就好」。本專案的使用者
 * 以長輩為主，白畫面只會得到「這個 App 壞了」的結論。
 *
 * 判定為 chunk 載入失敗時先自動重載一次（重載會重新取得 index.html，而它
 * 設為 no-cache，因此一定拿到最新的 chunk 檔名），使用者通常不會察覺發生
 * 過什麼；重載後仍失敗才呈現錯誤畫面。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  private reload = () => {
    if (this.props.reload) {
      this.props.reload();
      return;
    }
    window.location.reload();
  };

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error);
    if (isChunkLoadError(error) && shouldAutoReload()) {
      this.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback onReload={this.reload} />;
    }
    return this.props.children;
  }
}

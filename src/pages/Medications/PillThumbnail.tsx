import { useState } from 'react';
import { cn } from '@/lib/utils';

interface PillThumbnailProps {
  /** 已解析好的縮圖 URL；null／undefined 代表沒有照片可顯示 */
  src: string | null | undefined;
  alt: string;
  className?: string;
}

/**
 * 藥丸縮圖。src 為空或載入失敗時回傳 null（不佔版面），呼叫端本來就要
 * 隨時準備好呈現純文字描述（spec「照片缺席時的降級」：沒有照片只是少
 * 一個輔助，不能因此出現空的圖片區塊或破損版面）。
 *
 * 縮圖本身已是 160px、等比縮放、置中補白的正方形（design.md 決策 6），
 * 因此用 object-contain 而非 object-cover——後者會裁切，而尺規正是
 * 分辨同名同形藥品的關鍵線索（例如普拿疼膜衣錠與普拿疼速效膜衣錠皆為
 * 白色橢圓，唯一差異是尺規顯示的長度），裁掉會直接毀掉這個能力最需要
 * work 的情境。
 */
export function PillThumbnail({ src, alt, className }: PillThumbnailProps) {
  // 記住「哪一個 src 曾經載入失敗」而不是單純的布林值，讓 src 換了（例如
  // 使用者切換候選）時能在渲染當下直接算出「這是新的圖，還沒失敗過」，
  // 不需要額外一個 useEffect 在下一輪渲染才把 failed 重置回 false
  // （React 建議寫法：衍生值直接在渲染時算，不要在 effect 裡同步 setState
  // 只為了重置狀態）。
  const [failedSrc, setFailedSrc] = useState<string | null | undefined>(null);
  const failed = failedSrc === src;

  if (!src || failed) return null;

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailedSrc(src)}
      className={cn(
        'aspect-square shrink-0 rounded-xl border border-border bg-muted object-contain',
        className,
      )}
    />
  );
}

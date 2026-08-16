import { useEffect, useState } from 'react';
import { resolveDrugAppearanceImageUrl } from '../../utils/drugAppearanceImage';

interface Resolved {
  licenseNumber: string | null | undefined;
  url: string | null;
}

/**
 * 依證號取得藥丸縮圖的對外 URL。
 *
 * 只有掃描草稿的候選（DrugCandidate）帶著後端就地解析好的 thumbnail_url；
 * 已建立的 Medication 沒有這個欄位（見 app/models/medication.py 的註解：
 * 縮圖是靜態資源，沒有必要把每一種可能的對外路徑都存進資料庫），所以
 * 藥品清單／提醒卡片這裡改由前端依證號自行算出同一條路徑（design.md
 * 決策 4：這條規則本來就允許呼叫端自行推算，不算額外洩漏）。
 *
 * sha256 是非同步的 Web Crypto API，因此回傳值在算完之前是 null——呼叫端
 * 原本就要處理「沒有照片」的狀態，這裡沒有照片與算不出網址共用同一個
 * null，呈現邏輯不需要多一種狀態。
 */
export function useDrugAppearanceImageUrl(
  licenseNumber: string | null | undefined,
): string | null {
  const [resolved, setResolved] = useState<Resolved>({ licenseNumber: undefined, url: null });

  useEffect(() => {
    let cancelled = false;
    resolveDrugAppearanceImageUrl(licenseNumber).then((url) => {
      // 元件可能在算完之前就換了證號或卸載，過期的結果不能覆蓋目前狀態。
      if (!cancelled) setResolved({ licenseNumber, url });
    });
    return () => {
      cancelled = true;
    };
  }, [licenseNumber]);

  // licenseNumber 換了、但這一輪的非同步計算還沒回來之前，狀態裡存的仍是
  // 上一個證號的結果——用渲染當下的比較擋掉它，而不是在 effect 開頭另外
  // 呼叫一次 setState(null) 來重置（React 建議寫法：能在渲染時衍生出來的
  // 值，不需要多一次 effect 內的同步 setState）。
  return resolved.licenseNumber === licenseNumber ? resolved.url : null;
}

---
name: care-frontend
description: CARE-LIFF 前端的設計與實作規範。在這個專案裡寫或改任何 .tsx / .css、加頁面、加元件、動版面、動顏色、動字級、動動效之前必讀。涵蓋 design token 唯一來源、高齡可讀性硬底線、三主題（light/dark/high-contrast）、LIFF 手機情境、i18n 文案、以及交付前的自檢清單。
---

# CARE-LIFF 前端規範

這個 App 的使用者以長輩為主，跑在 LINE 內嵌的 LIFF WebView 裡。
優化目標是「75 歲的人看得到、按得到」，不是「看起來不像 AI 做的」。
兩者衝突時，前者贏。

技術現況：Vite + React 19 + Tailwind v4 + shadcn(base-maia, Base UI) + lucide + motion + i18next。
不是 Next.js，沒有 RSC，不要寫 `'use client'`。

---

## 1. 顏色：tokens.css 是唯一來源

`src/styles/tokens.css` 是全專案唯一的顏色定義處。裡面每個色值都附了對比度與文獻依據
（tritan 色覺缺陷、Wijk et al. 1999、IJHCI 2024、Piepenbrock et al. 2013）。
**不要因為「看起來比較好看」去改它，也不要繞過它。**

### 禁止

- 任何字面色值：`#2f6b1c`、`rgb(...)`、`rgba(...)`、`hsl(...)` 寫在 .tsx 或元件 CSS 裡
- 任何 Tailwind 內建色階：`text-gray-600`、`bg-zinc-50`、`border-slate-200`、`text-emerald-500`……
  （目前全專案 0 處使用，維持 0）
- 在 `:root` 新增顏色變數。新顏色一律加進 `tokens.css`，且四種主題組合都要給值

### 允許的例外（只有這些）

| 情境 | 例子 |
|---|---|
| `var()` 的 fallback，用於樣式表載入前的閃現保護 | `LiffAuthProvider.tsx` 的 inline style |
| LINE Flex Message 的 JSON（不是 CSS，LINE 端渲染） | `InviteButton.tsx` 的 `#06c755` |

`GlidingTabs.tsx` 的 `shadow-[...rgba(14,147,132,...)]` 是舊配色遺留的違規（那是青綠，根本不在現行色盤裡）。
碰到那個檔案時順手改成 `shadow-pop` 或 token 化的陰影。

### 要用的名字

`src/index.css` 已經把 tokens 映射成 utility，直接用：

- 面：`bg-background` `bg-card` `bg-surface-2` `bg-surface-3`
- 字：`text-ink` `text-foreground` `text-muted-foreground` `text-faint`
- 品牌：`bg-primary` `text-primary-foreground` `text-coral` `bg-coral-soft`
- 狀態：`bg-destructive` `text-success` `bg-warning-soft`
- 線：`border-border` `border-hair`
- 圓角：`rounded-sm/md/lg/xl`　陰影：`shadow-card` `shadow-pop` `shadow-modal`

**shadcn 命名陷阱**（`index.css` 開頭有完整說明，改之前先讀）：
CARE 的 `--muted` 是次要**文字**色、shadcn 的 `--muted` 是次要**背景**色；
CARE 的 `--accent` 是品牌陶橘、shadcn 的 `--accent` 是 hover 底色（品牌橘的 utility 叫 `coral`）。
不要在 `:root` 覆寫這三個名字。

---

## 2. 高齡可讀性硬底線

違反其中任一條 = 交付了壞掉的東西。

- **觸控目標 ≥ 44px**。Button/Input/Select 的 `default` 已經是 `h-11`（不是 shadcn 原本的 `h-9`），
  自訂可點元素也要 `h-11` / `size-11` 起跳。`xs` 與 `icon-xs` 是密集版面的**明確 opt-in**，不是預設。
- **尺寸用 rem，不用 px**。設定頁的字級功能靠 `html { font-size: var(--base-font-size) }`
  在 16/20/24px 之間切換，寫死 px 的元件不會跟著放大。
- **內文不小於 `text-sm`**，主要內容用 `text-base` 以上。不要用 `text-xs` 當內文。
- **內文對比目標 AAA (7:1)**，品牌色與狀態色至少 AA (4.5:1)。新增顏色要在 tokens.css 註明對比值。
- **不要壓縮行高與字距**。`leading-none`、`tracking-tighter` 這類「看起來精緻」的排版在這裡是可讀性損失。
  標題預設 `leading-tight` 以上，內文 `leading-relaxed`。
- **語意不能只靠顏色**。狀態一律「顏色 + 圖示 + 文字」三重編碼
  （這也是 `--success` 刻意與 `--primary` 同色的前提：語意由圖示與文字承擔）。

---

## 3. 三主題必須同時成立

主題有四種組合：light / dark / high-contrast / high-contrast+dark。
`.dark` 由 next-themes 掛在 html，`html.high-contrast` 來自設定頁的無障礙選項。

- `@theme inline` 讓 utility 輸出 `var(--xxx)`，**主題切換是自動的**。
  正確用法下不需要寫任何 `dark:` 顏色 class。
- 看到 `dark:bg-[#xxx]`、`dark:text-gray-300` 這種寫法 = 有人繞過了 token 層，修掉。
- **深色模式不能用寫死的白字**。`--primary` 在深色下是亮黃綠，白字實測 1.4:1 完全不可讀，
  一律用 `text-primary-foreground`。
- 改任何顏色相關的東西，四種組合都要看過再說完成。

---

## 4. 版面：手機優先的 LIFF WebView

- 主要視口是 LINE 內嵌 WebView 的手機直式。桌機是次要情境。
- **不要用 `h-screen`**，用 `min-h-[100dvh]`（iOS Safari 網址列會讓 vh 跳動）。
  現存的 `min-h-screen`（Join、PersonalHealth）碰到時順手換掉。
- **多欄用 CSS Grid**，不要用 flex 百分比 calc（`w-[calc(33%-1rem)]`）。
- **每個多欄佈局都要明確寫出 `< 768px` 的 fallback**，寫在同一個元件裡。
  不要假設「Tailwind 會處理」。
- 底部導航高 `--bottom-h` (72px)，`.content-area` 已預留 padding，不要重複加。
- 側欄 `--sidebar-w` (240px)、Header `--header-h` (60px)，要用就讀變數。
- 間距走 4px 網格的 `--sp-1` ~ `--sp-8`，或對應的 Tailwind 級距。不要出現 `p-[13px]`。

---

## 5. 動效

- **reduced-motion 已在 `index.css` 全域處理**，元件端不要重複寫 media query。
- 時間與曲線用 token：`--dur-1` (140ms) / `--dur-2` (220ms) / `--ease` / `--ease-out`。
- 淡入位移用 tw-animate-css 的 `animate-in fade-in slide-in-from-*`（shadcn 元件同一套）。
  不要為此新增 keyframes。專案自有的只保留 `animate-heartbeat` 與 `animate-badge-wiggle`。
- **禁止**：scroll-jacking、視差捲動、水平 pan 敘事、捲動釘選（sticky-stack）、自訂滑鼠游標、
  進場延遲超過 300ms 的 stagger。這些是 landing page 的手法，套在長輩用的工具型 App 上只會讓人找不到內容。
- 連續動畫（loading 以外）不要無限循環。`animate-heartbeat` 是已經評估過的例外。

---

## 6. 文案與 i18n

- **所有使用者可見字串都走 i18next**，寫在 `src/i18n/messages.ts` 或對應的分檔。
  .tsx 裡不可以有 hardcode 的中文或英文字串。
- 中文文案用全形標點。破折號少用；需要停頓時拆成兩句或用逗號。
- **假資料的 AI 破綻**（有機會被截圖或進 demo 的地方特別注意）：
  - 不要 `王小明` / `John Doe` / `測試使用者` 這種佔位名，用真實感的在地姓名
  - 不要假精確數字（`99.99%`、`1234567`）。用有機的數值，或明確標記為範例
  - 不要填充動詞（「打造」「賦能」「一站式」「智慧化」）。用具體動作描述
  - 假的頭像不要用 lucide 的 user 圖示充數
- 醫療與健康相關文案不要自行發明數據或宣稱。內容有疑義就問，不要編。

---

## 7. 元件與圖示

- **先找 `src/components/ui/`**（29 個 shadcn/Base UI 元件已就位）。不要手刻已經有的東西。
- 需要新的 shadcn 元件時用 CLI 加（`components.json` 已設定 base-maia + neutral + cssVariables），
  加完檢查它有沒有帶進寫死的顏色或 `h-9` 尺寸，有的話按 §1 §2 改掉。
- **圖示只用 `lucide-react`**，一個專案一個家族。不要混用其他圖示庫，也不要手畫 SVG path。
- 表單一律 react-hook-form + zod，不要自己管 controlled state。
- 資料抓取用 TanStack Query，不要在 useEffect 裡手寫 fetch。

---

## 8. 通用反 slop（與上面規則不衝突時才適用）

- 不用外光暈 / neon glow，陰影用 `shadow-card` / `shadow-pop`。
- 不用純黑 `#000`（tokens 裡本來就沒有）。
- 不用漸層文字當標題。
- 不用 div 拼出來的假截圖 / 假儀表板。
- 裝飾性的彩色小圓點：只有在真的表達狀態時才用，不要每個列表項都掛一顆。
- section 上方的 uppercase 小標籤（eyebrow）節制使用，不要每一區都來一個。
- 不要用「01 / 02 / 03」這種編號小標題。內容本身就是標題。
- shadcn 元件不要停在預設外觀，圓角與顏色要對齊 CARE 的級距（`--r-*` 已映射到 `rounded-*`）。

---

## 9. 交付前自檢

說「做完了」之前，跑過並看到結果：

```bash
npm run lint
npm run test

# 字面色值（只允許 §1 表列的兩種例外）
grep -rnE "#[0-9a-fA-F]{6}\b|rgba?\(" src --include="*.tsx"

# Tailwind 內建色階（應為 0 筆）
grep -rnE "(text|bg|border|ring|fill|stroke)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}" src --include="*.tsx"

# hardcode 文案（引號內的中文，已濾掉多數註解；仍需人眼確認）
grep -rnE "['\"\`][^'\"\`]*[一-龥]" src --include="*.tsx" \
  | grep -vE ":[0-9]+: *(//|\*|/\*|\{/\*)" | grep -v "^src/tests/"
```

最後一條目前約 40 筆，合法的只有三類：`console.error` 的除錯訊息、
語言選單裡刻意不翻譯的 `繁體中文` / `日本語`、以及漏網的多行註解。
其餘（特別是 `aria-label="切換高對比模式"` 這類）都是該進 i18n 的，
碰到就順手搬走——螢幕閱讀器的使用者同樣需要跟著語言設定走。

再確認：

- [ ] 四種主題組合（light / dark / high-contrast / hc+dark）都看過
- [ ] 字級設定 16 / 20 / 24px 三檔都不破版
- [ ] 新增的可點元素都 ≥ 44px
- [ ] 手機直式（375px 寬）與 768px 以上都檢查過
- [ ] 新字串都在 i18n 裡

改動涉及顏色或字級時，把依據寫進 tokens.css 的註解——那個檔案的既有註解都附了對比值與文獻，維持這個標準。

## 簡介
- CARE醫療資訊AI助手之前端，應用整合 LINE LIFF，提供設定、個人健康與家庭管理介面，包含 E2E 測試範例。

## 專案架構
```
CARE-LIFF
├─ .github/
├─ e2e/                         # Playwright E2E 測試
│  └─ home.spec.ts
├─ playwright-report/
├─ public/
├─ data/
├─ test-results/
├─ src/
│  ├─ api/
│  │  ├─ authApi.ts
│  │  ├─ familyApi.ts
│  │  └─ profileApi.ts
│  ├─ assets/
│  ├─ components/
│  │  ├─ BottomNav/
│  │  ├─ Header/
│  │  └─ Sidebar/
│  ├─ context/
│  ├─ i18n/
│  │  ├─ index.tsx
│  │  └─ messages.ts
│  ├─ pages/
│  │  ├─ Family/
│  │  ├─ Home/
│  │  ├─ Loginpage/
│  │  ├─ PersonalHealth/
│  │  │  └─ ConsultRecords/
│  │  └─ Settings/
│  ├─ test/                     # 測試設定（例如 setup）
│  │  └─ setup.ts
│  ├─ tests/                    # 單元/整合測試（vitest + RTL）
│  │  ├─ home.test.tsx
│  │  ├─ i18n.test.ts
│  │  └─ settings.test.ts
│  ├─ types/
│  │  └─ family.ts
│  └─ utils/
├─ package.json
├─ playwright.config.ts
├─ tsconfig.json
├─ tsconfig.app.json
├─ tsconfig.node.json
├─ vite.config.ts
└─ README.md
```

## 套件需求
- Node.js（建議 LTS，Node 18+）
- npm
- Playwright（開發相依，專案已在 `devDependencies` 定義）

## 快速下載與安裝
```bash
git clone <your-repo-url>
cd CARE-LIFF
npm install
```

## 環境變數
- 複製範例並編輯：
```bash
# mac / linux
cp .env.example .env

# windows (cmd)
copy .env.example .env
```
- 主要設定：`VITE_LIFF_ID`, `VITE_API_BASE_URL`。

## 本地開發
- 啟動開發伺服器：
```bash
npm run dev
```
- 開發伺服器預設網址：`http://localhost:5173`

## 執行 Playwright E2E 測試
- 建議流程（先啟動 dev server）：

```bash
# 終端 A：
npm run dev

# 終端 B：執行測試
npx playwright test
```
- 單一檔案測試：
```bash
npx playwright test e2e/home.spec.ts
```
- 若要讓 Playwright 自動啟動 dev server（如 CI）：
```bash
CI=true npx playwright test
```
- 如缺少瀏覽器，執行：
```bash
npx playwright install --with-deps
```

## 常見排查點
- 本地失敗但 CI 通過：確認是否已啟動 dev server 或使用 `CI=true` 讓 Playwright 啟動伺服器。
- 測試找不到元素：確認元件的 class 名稱與文字是否與測試檔一致（例如 `button.feature-card`）。

## CI (GitHub Actions)
- Workflow 位於 `.github/workflows/playwright.yml`，會安裝相依、安裝 Playwright 瀏覽器並執行 `npx playwright test`。

---


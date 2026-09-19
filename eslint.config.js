import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // shadcn/ui 產生的元件照慣例會在同一個檔案裡連同 cva 的 variants 一起匯出，
    // 觸發 react-refresh/only-export-components。這些檔案由 shadcn CLI 產生、升級時
    // 會被覆寫，拆檔等於每次升級都要重做；而這條規則只影響開發時的 Fast Refresh，
    // 不影響正式行為，所以這個目錄關掉。自己寫的元件不在此列。
    files: ['src/components/ui/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Playwright 的 fixture 第二個參數固定叫 `use`，react-hooks 外掛會誤判成
    // 在非元件裡呼叫 Hook。e2e 目錄沒有 React 元件，整條規則關掉即可。
    files: ['e2e/**/*.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
])

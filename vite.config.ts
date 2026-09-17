import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // 對齊 Tailwind v4 的瀏覽器下限（Chrome 111 / Safari 16.4，皆 2023-03）。
    // 這個 App 跑在 LINE webview、使用者多為長輩，裝置可能偏舊：
    // 明確釘住 target，讓 JS 與 CSS 的支援範圍一致，不會只有其中一邊悄悄用了更新的語法。
    target: ['chrome111', 'safari16.4', 'firefox128', 'edge111'],
  },
  server: {
    // 允許 ngrok 的網域連線進來
    allowedHosts: [
      'flavorous-wilber-unfestering.ngrok-free.dev',

      // 💡 小秘訣：因為 ngrok 每次重開網址都會變，
      // 你也可以直接加入 '.ngrok-free.dev'，這樣以後不管網址前面怎麼變，都不用再回來改這行了！
      '.ngrok-free.dev',

      // 實機測試用的其他通道（動作感測器只在 HTTPS 下供資料，區網 IP 不行）：
      // VS Code 連接埠轉送、cloudflared quick tunnel、localtunnel。
      '.devtunnels.ms',
      '.trycloudflare.com',
      '.loca.lt'
    ],

    // 實機測試：手機載入的是通道的 HTTPS 頁面，若 API 指向 localhost 會打到
    // 手機自己，指向 http:// 又會被混合內容擋下。把 /api 代理到本機後端，
    // VITE_API_BASE_URL 就可以填通道網址本身（同源），只需要一條通道。
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/tests/setup.ts',
    env: {
      VITE_LIFF_ID: 'test-liff-id',
    },
    // e2e 由 Playwright 跑，vitest 不要抓。
    // .worktrees：git worktree 是同一個 repo 的另一份簽出，裡面有一模一樣的
    // 測試檔，不排除會讓每個測試跑兩次，且其 e2e 目錄不符合上面的 'e2e/**' 樣式。
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**', '**/.worktrees/**'],
  },
})

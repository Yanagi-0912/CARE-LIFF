# LIFF 手動測試清單

自動化測試的分工是：vitest 顧邏輯、Playwright + LIFF Mock 顧路由／流程／版面。
但 **Playwright 永遠進不了 LINE App 的 WebView**，而 `@line/liff-mock` 對所有
LIFF API 一律回假資料——所以下面這些行為只有真機、真 LINE 帳號才驗得到。

每次「發版前」與「LIFF SDK 升版後」各跑一輪。單項改動只需跑對應章節。

## 裝置矩陣

| 代號 | 環境 | 說明 |
|---|---|---|
| **A** | Android LINE App | Chromium WebView |
| **I** | iOS LINE App | WKWebView，行為差異最多 |
| **B** | 手機外部瀏覽器 | Chrome / Safari，`liff.isInClient()` 為 false 的分支 |

每項標了建議環境；標 **A+I** 的表示兩台都要跑。

## 前置準備

- [ ] 後端可連線（`VITE_API_BASE_URL` 指向的環境活著；care-dev 的 VM 有開機）
- [ ] LINE Developers Console 的 LIFF Endpoint URL 指向本次要測的部署（必須 HTTPS）
- [ ] 兩個測試帳號：**帳號甲**＝從未登入過 CARE（驗首次授權），**帳號乙**＝已有健康檔案
- [ ] 測前把帳號甲在「LINE 設定 → 帳號 → 授權中的應用程式」裡撤銷 CARE 的授權

---

## 1. 真實 LINE 登入（`src/pages/Loginpage/index.tsx`、`LiffAuthProvider`）

mock 的 `liff.login()` 是 no-op，整條 OAuth 來回只能真機驗。

- [ ] **A+I 首次登入（帳號甲）**：從 Rich Menu 進入 → 出現 LINE 授權同意畫面 →
      同意後回到 App 並落在首頁，不是卡在登入頁或白畫面
- [ ] **A+I 再次開啟（帳號乙）**：關掉 LIFF 再從聊天室重開 → 不再出現授權畫面，直接進首頁
- [ ] **A 深連結還原**：未登入狀態直接開 `https://<endpoint>/settings` →
      走完整 OAuth 來回後**回到 /settings**，不是首頁
      （e2e 只驗過 mock 下的 sessionStorage 還原；真 OAuth 會整頁離站再回來，靠的是 `?redirect=` 撐過去）
- [ ] **B 外部瀏覽器登入**：用手機瀏覽器開 Endpoint URL → `liff.login()` 導去
      LINE 網頁版登入 → 登入後回得來、拿得到憑證
- [ ] **A 登出再登入**：設定頁登出 → 停在登入頁不自動彈回 → 按「使用 LINE 重新登入」→ 成功
- [ ] **I 過期 session**：LINE session 過期（或撤銷授權後不重登）時開個人健康頁 →
      頁面仍完整顯示、姓名欄空白，**不是白畫面**（守的是 `PersonalHealth` 的 getProfile try/catch）

## 2. 邀請家人 shareTargetPicker（`src/pages/Family/InviteButton.tsx`）

mock 拿不出真的好友選擇器，Flex Message 的實際渲染也只有 LINE 客戶端看得到。

- [ ] **A+I 完整邀請**：家庭頁按邀請 → 跳出好友選擇器 → 選一位送出 →
      對方聊天室收到邀請卡片，**卡片排版正常**（標題、說明、按鈕都在）
- [ ] **A 受邀方入席**：對方點卡片按鈕 → 開啟 `/join?code=...` → 成功加入家庭
- [ ] **A 取消不誤報**：跳出選擇器後按取消 → 回到家庭頁，**沒有**成功或失敗 toast
- [ ] **B 瀏覽器 fallback**：外部瀏覽器按邀請 → 走 `navigator.share` 系統分享面板；
      分享面板也按取消一次，確認不會誤報成功

## 3. openWindow／closeWindow（`KnowledgeReports`、`ConsultRecords`）

- [ ] **A+I 回到 LINE 詢問**：知識回報頁按「回到 LINE 詢問」→ LIFF 視窗關閉、
      **落回原本的聊天室**（不是 LINE 首頁）
- [ ] **B 瀏覽器提示**：外部瀏覽器按同一顆按鈕 → 不關視窗，出現 toast 提示
- [ ] **I 下載諮詢摘要**：諮詢紀錄頁按下載 → `openWindow(external: true)` 跳外部
      瀏覽器 → **檔案真的下載成功**（iOS 對下載最挑剔，必驗）
- [ ] **B 下載**：外部瀏覽器直接導向下載網址，檔案成功下載

## 4. WebView 實機呈現

Playwright 的 Pixel 5／iPhone 12 只是視窗尺寸模擬，不是真 WebView。

- [ ] **I 安全區**：有瀏海的 iPhone 上，底部導覽列不被 Home 條蓋住、頂部不被瀏海切到
- [ ] **A+I 鍵盤**：個人健康表單點輸入框 → 鍵盤彈出時輸入框仍可見、收起後版面復原
      （e2e 用 `min-h-[100dvh]`＋視窗模擬驗不到真鍵盤）
- [ ] **A 系統字級**：把 Android 系統字體調到最大 → App 內開「特大」字級 → 版面不爆、不橫向捲動
- [ ] **A+I 長輩實感**：以實際手指（非滑鼠）操作首頁六卡與底部導覽，無誤觸

## 5. 無障礙輔助技術

自動化只量了尺寸與對比組合，沒驗過螢幕閱讀器實際唸什麼。

- [ ] **I VoiceOver**：走完「首頁 → 個人健康 → 填姓名 → 儲存」，每步都有可理解的朗讀
- [ ] **A TalkBack**：同上流程
- [ ] **A 高對比主題**：戶外強光下實測高對比模式是否真的看得清（這是設計目標，不是儀器能量的）

## 6. 入口與多語

- [ ] **A+I Rich Menu**：每顆 Rich Menu 按鈕開到正確頁面（Console 上的 path 沒接錯）
- [ ] **A 語言設定**：清掉 App 資料後首次開啟 → 介面是繁體中文
      （程式沒有偵測系統語言，`getInitialLanguage` 固定 fallback zh-TW，這是現狀不是 bug）；
      設定頁切到印尼語 → 關掉 LIFF 重開後仍是印尼語

---

## 記錄

跑完在 PR 或 release note 附上：日期、App 版本（commit）、LINE App 版本、
裝置型號，以及未通過項目的截圖。任何一項紅了就不發版。

> e2e 已自動覆蓋的項目（路由守衛、token 換發、登出旗標、觸控目標、主題組合、
> 字級切換）**不要**重複列進手動清單——清單越短越可能被確實執行。

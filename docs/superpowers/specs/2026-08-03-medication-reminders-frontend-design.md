# 用藥提醒前端（LIFF）設計

日期：2026-08-03
狀態：已核可，待實作

## 背景

後端 CARE 已完成用藥提醒的完整功能：資料模型、CRUD API、雙階遞進排程引擎（T+0 提醒 → T+20 催促 → T+30 家屬警報）、以及 LINE Flex 卡片打卡。但 LIFF 前端完全沒有對應頁面，Rich Menu 的「用藥提醒」按鈕目前指向 `/family`。

本設計補上前端的**設定管理**介面，不改動後端任何一行。

## 範圍

### 做

- 新頁面 `/medications`：對象切換、提醒列表、新增、編輯（時間／起訖日期／啟用）、刪除
- 導覽入口三處：Sidebar、首頁功能卡、BottomNav 第五格
- 六語言 i18n（zh-TW / en / id / vi / th / ja）
- 元件層測試（vitest + React Testing Library）

### 不做

- 後端任何改動
- 藥品名稱與劑量（後端資料模型沒有這些欄位）
- 今日用藥清單／打卡／服藥紀錄（後端沒有對外的查詢端點）
- Rich Menu「用藥提醒」格的指向修正（位於後端 `app/services/line_messaging/rich_menu_layout.py`）

## 使用的後端 API

| 方法 | 路徑 | 用途 |
|---|---|---|
| `GET` | `/api/medications/reminders?target_user_id=` | 查某人的提醒列表。省略參數則回傳本人 |
| `POST` | `/api/medications/reminders` | 建立提醒。body: `{ user_id, slots[], start_date?, end_date? }` |
| `PUT` | `/api/medications/reminders/{id}` | 修改 `scheduled_time` / `start_date` / `end_date` / `enabled` |
| `DELETE` | `/api/medications/reminders/{id}` | 刪除提醒 |

`POST /confirm/{log_id}` 不使用（打卡留在 LINE 聊天室的 Flex 卡片上）。

後端限制兩點，直接決定了 UI 形狀：

1. `POST` 只接受 `slots` 陣列，時間一律套後端預設（早 08:00、中 12:00、晚 18:00、睡前 21:30）。要改時間必須另外打 `PUT`。→ 所以新增表單不提供時間欄位，改時間走編輯。
2. `GET` 一次只能查一個 `target_user_id`（`get_creator_reminders` 沒有對外端點）。→ 所以用對象切換器而非全家一次列出。

## 架構

### 檔案結構

```
src/types/medication.ts              DTO 型別、SLOT_TYPES 常數
src/api/medicationApi.ts             4 支 API 包裝
src/i18n/medicationMessages.ts       medicationFeatureMessages（六語言）
src/hooks/useFamily.ts               ← 從 pages/Family/useFamily.ts 搬上來共用
src/pages/Medications/
  index.tsx                          頁面組裝
  index.css
  useMedications.ts                  資料層 hook
  ReminderCard.tsx
  ReminderFormDialog.tsx             新增
  ReminderEditDialog.tsx             編輯／刪除
src/tests/medications.test.tsx
```

`useFamily` 從 `pages/Family/` 搬到 `src/hooks/`：對象切換器需要家庭成員清單，若跨頁 `import '../Family/useFamily'` 會讓兩個頁面互相耦合。搬移只需改 Family 頁一行 import。

### 元件邊界

- **`useMedications(targetUserId)`** 是唯一碰 `medicationApi` 的地方。回傳 `{ reminders, loading, error, create, update, remove, refetch }`。mutation 成功後 refetch；失敗時 throw，由呼叫端顯示 toast。
- **`index.tsx`** 只持有 UI 狀態：`selectedUserId`（預設 `getLineUserId()`）、哪個 dialog 開著、toast。切換對象即改 `targetUserId`，hook 自動重抓。
- **`ReminderCard` / `ReminderFormDialog` / `ReminderEditDialog`** 皆為 presentational：吃 props、回 callback，不知道 API 存在，可獨立測試。

### 資料流

```
useFamily ──成員清單──┐
                      ├─→ index.tsx（selectedUserId）
getLineUserId() ──────┘         │
                                ├─→ useMedications(selectedUserId) ─→ medicationApi
                                └─→ ReminderCard / Dialogs（props + callbacks）
```

## UI 規格

### 列表頁

- 頁首：標題「用藥提醒」+ 右側「新增」按鈕
- 對象 chips 一列：`我自己` + 各家庭成員 `display_name`（缺 display_name 時退回 `family.unset` 文案）
- 提醒卡片依 `scheduled_time` 升冪排序。每張卡：
  - 左：時段 badge（早／中／晚／睡前，四色）
  - 中：`scheduled_time`、起訖日期（無結束日顯示「長期」）
  - 右：啟用開關 —— 原地切換、樂觀更新，失敗回滾並顯示 toast
  - 點卡片本體開編輯 dialog
- 三態版面沿用 Family 頁：loading / error / empty。空狀態文案帶對象名稱。

### 新增 dialog

欄位：時段四選複選、開始日期（預設今天）、結束日期（可留空＝長期）。

**提醒對象顯示為唯讀文字，不在 dialog 內提供選擇器。** 對象由頁面上方的 chips 決定 —— dialog 內若能改對象，就得知道那位對象已設定過哪些時段才能正確停用 checkbox，但列表 API 一次只能查一個人。把對象維持單一來源（chips）可避免這個矛盾，代價是幫別人設定前要先切一次 chip。

**已存在的時段 checkbox 會 disabled 並標「已設定」** —— 後端不擋重複建立，這層防護放在前端。四個時段都已設定時停用送出按鈕。

驗證：至少勾一個時段；結束日期不可早於開始日期（`YYYY-MM-DD` 直接字串比較）。送出一次 `POST`。

### 編輯 dialog

欄位：`<input type="time">` 時間、起訖日期、啟用 checkbox。只把真正變動的欄位放進 `PUT` 的 patch，全無變動則直接關閉。底部「刪除此提醒」需二次確認。

若該筆原本有結束日期而使用者把欄位清空，儲存會被擋下並就地顯示說明（後端無法把 `end_date` 清成 null，見「已知限制」）。

## 錯誤處理

- 沿用 `useToast`，API 錯誤直接顯示後端 `detail`（後端已回中文，例如「用藥對象必須是您的家庭成員」）
- `medicationApi` 沿用 `familyApi` 的 `parseError` 模式解析 `detail` / `message`
- 日期字串（`YYYY-MM-DD`）一律當純文字處理，**不經 `new Date()` 解析**，避免被當 UTC 午夜再轉本地時區而差一天
- 「今天」用本地日期組字串，不用 `toISOString()`

## 測試

`src/tests/medications.test.tsx`，mock `medicationApi` 與 `hooks/useFamily`：

1. 列表渲染，且卡片依時間排序
2. 切換對象 chip 會以新的 `target_user_id` 重抓
3. 新增表單擋掉該對象已存在的時段
4. 啟用開關 API 失敗時 UI 回滾

## 已知限制（後端造成，本次不處理）

- **時區**：頁面顯示的 `08:00` 就是後端存的 `08:00`，前端不做任何換算。後端目前全程以 UTC 判定觸發時間，所以「早上 08:00」實際在台灣時間 16:00 推播。前端刻意不補償 —— 後端修好時區後這頁不需改動。
- **結束日期無法清空**：`MedicationService.update_reminder` 用 `model_dump(exclude_none=True)`，`MedicationReminderRepository.update_reminder` 又再濾一次 `None`，所以 `end_date: null` 送不進去。設過結束日只能改成別的日期，無法回到「長期」。編輯 dialog 上會註明。
- **沒有藥名／劑量欄位**：卡片只能顯示時段與時間。
- **沒有服藥紀錄 API**：這頁看不到打卡狀況與服藥率。

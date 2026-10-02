import { ShieldCheck, Stethoscope, FileText, AlertTriangle } from 'lucide-react';

const collectedData = [
  'LINE User ID、顯示名稱、頭像與登入狀態。',
  '你在 CARE 中輸入的訊息、問題、回饋與設定。',
  '健康紀錄，例如血壓、血糖、脈搏、體重、步數、經期、用藥與掛號資訊。',
  '你上傳的圖片、藥袋、音訊、影片、文件或看診錄音。',
  'AI、OCR、語音轉文字或文件解析產生的摘要、逐字稿與辨識結果。',
  '家庭照護功能中的成員關係、角色、授權範圍與通知紀錄。',
  '系統日誌、錯誤紀錄、裝置與連線資訊，用於除錯與安全維護。',
];

const retentionItems = [
  ['使用者上傳文件切片', '預設約 24 小時'],
  ['藥袋辨識草稿', '預設約 60 分鐘'],
  ['看診錄音等待狀態', '預設約 3 小時'],
  ['看診原始音檔', '處理期間暫存，完成或失敗後刪除'],
  ['看診逐字稿與摘要', '預設約 30 天'],
  ['對話、健康紀錄、用藥與掛號資料', '測試帳號存續期間或測試資料清理時刪除'],
];

const permissions = [
  ['位置權限', '附近醫療資源、防走失或限時位置分享。'],
  ['相機或檔案權限', '上傳藥袋、圖片、文件或影片。'],
  ['麥克風或音訊權限', '語音、錄音或看診摘要。'],
  ['通知權限', '用藥、掛號、家庭照護或測試提醒。'],
  ['動作感測器', '計步功能。'],
];

export default function LegalTestingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-10 sm:px-8">
          <div className="flex items-center gap-3 text-primary">
            <ShieldCheck className="size-7" aria-hidden="true" />
            <span className="text-sm font-semibold">CARE 測試版</span>
          </div>
          <div className="space-y-4">
            <h1 className="text-3xl font-bold tracking-normal sm:text-4xl">
              測試版簡易法務與隱私說明
            </h1>
            <p className="max-w-3xl text-base leading-8 text-muted-foreground">
              本頁適用於 CARE 內部測試、封閉測試、demo 或開發驗證。CARE 測試版仍在開發中，
              可能發生功能中斷、資料不完整、AI 回答錯誤、提醒延遲或介面異常。
            </p>
          </div>
          <div className="rounded-md border border-warning/30 bg-warning-soft px-4 py-3 text-sm leading-7 text-ink">
            <div className="flex gap-3">
              <AlertTriangle className="mt-1 size-5 shrink-0 text-warning" aria-hidden="true" />
              <p>
                CARE 提供的是健康資訊與生活輔助，不是醫療診斷、治療建議、處方、急救服務或醫師看診。
                若你身體不適、症狀嚴重、需要診斷或用藥調整，請洽詢合格醫療人員；緊急狀況請立即撥打當地緊急電話或前往急診。
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-4xl gap-8 px-5 py-8 sm:px-8">
        <section className="grid gap-4">
          <h2 className="text-2xl font-semibold">我們會蒐集哪些資料</h2>
          <ul className="grid gap-3 text-base leading-7 text-muted-foreground">
            {collectedData.map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-3 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="rounded-md bg-surface-2 px-4 py-3 text-sm leading-7 text-muted-foreground">
            請不要在測試版輸入不必要的敏感資料，例如身分證字號、金融資料、完整住址、他人病歷，
            或你不希望測試團隊看到的內容。
          </p>
        </section>

        <section className="grid gap-4">
          <div className="flex items-center gap-3">
            <Stethoscope className="size-6 text-primary" aria-hidden="true" />
            <h2 className="text-2xl font-semibold">健康敏感資料同意</h2>
          </div>
          <p className="text-base leading-8 text-muted-foreground">
            部分功能會處理健康、醫療、用藥、看診、經期、錄音或其他較敏感的資料。當你啟用或使用這些功能時，
            即表示你了解並同意 CARE 在測試目的必要範圍內蒐集、處理及使用相關資料。
          </p>
          <p className="text-base leading-8 text-muted-foreground">
            你可以選擇不使用特定功能；不提供相關資料時，該功能可能無法運作，但不影響其他測試功能。
            如果你上傳或輸入他人的資料，請確認你已取得該人的同意或具有合法權限。
          </p>
        </section>

        <section className="grid gap-4">
          <h2 className="text-2xl font-semibold">AI 與第三方服務</h2>
          <p className="text-base leading-8 text-muted-foreground">
            CARE 測試版可能使用 LINE、Google Gemini、資料庫、語音轉文字、文件解析、n8n、雲端或自架服務來處理資料。
            AI 回答可能不完整或不正確，請不要只依 AI 回答做醫療判斷。
          </p>
          <p className="text-base leading-8 text-muted-foreground">
            測試版預設不主動將可識別的使用者內容提供作為第三方模型訓練用途；但實際供應商的安全、濫用防制、
            紀錄保存或人工檢視規則，仍須依正式契約與供應商政策確認。
          </p>
        </section>

        <section className="grid gap-4">
          <h2 className="text-2xl font-semibold">資料保存與刪除</h2>
          <div className="overflow-hidden rounded-md border border-border bg-surface">
            {retentionItems.map(([label, value]) => (
              <div key={label} className="grid gap-1 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[13rem_1fr]">
                <div className="font-medium text-ink">{label}</div>
                <div className="text-muted-foreground">{value}</div>
              </div>
            ))}
          </div>
          <p className="text-sm leading-7 text-muted-foreground">
            測試結束、帳號刪除或你提出刪除請求後，CARE 會在合理作業時間內刪除或去識別化可處理的測試資料。
            因備份、稽核、安全、除錯或法律需求，部分資料可能需要較長時間才會完全消失。
          </p>
        </section>

        <section className="grid gap-4">
          <h2 className="text-2xl font-semibold">裝置權限與通知</h2>
          <div className="grid gap-3">
            {permissions.map(([label, desc]) => (
              <div key={label} className="rounded-md border border-border bg-surface px-4 py-3">
                <div className="font-semibold">{label}</div>
                <div className="mt-1 text-sm leading-7 text-muted-foreground">{desc}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4">
          <h2 className="text-2xl font-semibold">使用者責任</h2>
          <p className="text-base leading-8 text-muted-foreground">
            請不要冒用他人身分、未經同意輸入他人資料、上傳違法或惡意內容、嘗試攻擊或繞過權限，
            也不要將測試版 AI 回答當成正式醫療建議。若發現安全問題、錯誤回答或資料異常，請回報 CARE 團隊。
          </p>
        </section>

        <section className="grid gap-4 rounded-md border border-primary/20 bg-primary/5 p-5">
          <div className="flex items-center gap-3">
            <FileText className="size-6 text-primary" aria-hidden="true" />
            <h2 className="text-2xl font-semibold">測試版同意文字</h2>
          </div>
          <p className="text-base leading-8 text-muted-foreground">
            我了解 CARE 測試版仍在開發中，AI 回答與提醒可能不完整或錯誤，不能取代醫師、藥師或緊急醫療服務。
            我了解繼續使用 CARE 測試版，即表示我同意 CARE 為提供測試功能、健康紀錄、AI 問答、藥袋辨識、提醒、家庭照護、除錯與安全維護，
            在必要範圍內蒐集、處理及使用我的 LINE 帳號資訊、輸入內容、健康資料、上傳檔案、錄音、系統紀錄及相關分析結果。
            我也了解可拒絕使用特定功能或請求刪除測試資料。
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <span className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              繼續使用即視為同意
            </span>
            <span className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink">
              不同意請停止使用
            </span>
          </div>
        </section>

        <section className="grid gap-3 border-t border-border pt-6 text-sm leading-7 text-muted-foreground">
          <h2 className="text-lg font-semibold text-ink">聯絡與更新</h2>
          <p>
            你可以向 CARE 團隊請求查詢、更正、刪除、停止使用或撤回特定同意。測試期間可先透過專案負責人、
            測試群組或指定客服管道提出。CARE 可能依測試功能、資料流程或供應商調整更新本頁內容。
          </p>
          <p>更新日期：2026/10/03。正式聯絡窗口待測試版補齊。</p>
        </section>
      </div>
    </main>
  );
}

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // 長輩友善：置中偏下（避開頂部 header）、停留 5 秒、字級不縮小
      position="bottom-center"
      duration={5000}
      // 底部導覽列佔 var(--bottom-h)，toast 要往上讓開才不會被蓋住。
      // 必須走 offset / mobileOffset props：sonner 內部是
      // style={{ ...style, ...assignOffset(offset, mobileOffset) }}，
      // 不管有沒有傳 props 都會無條件寫入 --offset-* 與 --mobile-offset-*，
      // 寫在 style 裡的 --offset-bottom 會被蓋掉。
      // 又因為 ≤600px 時 sonner 的 CSS 改用 --mobile-offset-bottom 定位，
      // 只設 offset 在手機上一樣沒有效果，兩個都要給。
      offset={{ bottom: 'calc(var(--bottom-h) + 16px)' }}
      mobileOffset={{ bottom: 'calc(var(--bottom-h) + 16px)' }}
      icons={{
        success: (
          <CircleCheckIcon className="size-5" />
        ),
        info: (
          <InfoIcon className="size-5" />
        ),
        warning: (
          <TriangleAlertIcon className="size-5" />
        ),
        error: (
          <OctagonXIcon className="size-5" />
        ),
        loading: (
          <Loader2Icon className="size-5 animate-spin" />
        ),
      }}
      style={
        {
          // 對齊 CARE token（預設的 --popover 等已由橋接層映射，這裡直接取來源）
          "--normal-bg": "var(--surface)",
          "--normal-text": "var(--ink)",
          "--normal-border": "var(--line)",
          "--success-bg": "var(--success-soft)",
          "--success-text": "var(--success)",
          "--success-border": "var(--success)",
          "--error-bg": "var(--danger-soft)",
          "--error-text": "var(--danger)",
          "--error-border": "var(--danger)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast text-base",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }

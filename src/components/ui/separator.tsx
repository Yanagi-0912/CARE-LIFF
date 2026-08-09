"use client"

import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"

import { cn } from "@/lib/utils"

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      // Base UI 標的是 data-orientation="horizontal|vertical"，不是 data-horizontal /
      // data-vertical。用後者的話 Tailwind 產出的選擇器是 [data-horizontal]，永遠不命中，
      // 於是每一條 Separator 的寬或高都停在 0px（看不見）。
      className={cn(
        "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch",
        className
      )}
      {...props}
    />
  )
}

export { Separator }

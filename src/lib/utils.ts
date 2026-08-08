import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** 合併 class：clsx 處理條件式，twMerge 消解 Tailwind 的衝突 utility（後者勝出）。 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

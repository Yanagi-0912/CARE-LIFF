/**
 * 日期字串工具
 *
 * 後端的 start_date / end_date 是不帶時區的 YYYY-MM-DD 純日期。
 * 這裡刻意不使用 Date 解析，避免被當成 UTC 午夜再轉回本地時區而差一天。
 */

/** 取得本地時區的今天，格式 YYYY-MM-DD（不可用 toISOString，那是 UTC） */
export function todayLocalDateString(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** 顯示用格式：2026-08-03 → 2026/08/03（純字串替換，不解析日期） */
export function formatDateDisplay(dateStr: string): string {
  return dateStr.replaceAll('-', '/');
}

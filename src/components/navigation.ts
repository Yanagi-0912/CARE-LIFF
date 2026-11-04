import { BellIcon, HeartIcon, LayoutGridIcon, SettingsIcon, type LucideIcon } from 'lucide-react';

type NavigationItem = {
  path: string;
  label: string;
  icon: LucideIcon;
  /** 其他也歸這個分頁的路徑前綴；深連結進來時底部導覽仍亮在對的格子。 */
  owns: readonly string[];
};

/** 手機底部導覽與桌機側欄共用的四個分頁，順序即畫面順序。 */
export const navigationItems: readonly NavigationItem[] = [
  // 不屬於其他分頁的路徑（附近醫療、健康紀錄、看診錄音、知識回報、管理頁）都亮「工具」
  { path: '/', label: 'nav.tools', icon: LayoutGridIcon, owns: [] },
  { path: '/reminders', label: 'nav.notifications', icon: BellIcon, owns: ['/medications'] },
  { path: '/personalhealth', label: 'nav.health', icon: HeartIcon, owns: ['/family', '/lost'] },
  { path: '/settings', label: 'nav.settings', icon: SettingsIcon, owns: [] },
];

const underPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export function activeNavigationPath(pathname: string) {
  return navigationItems.find(({ path, owns }) =>
    path !== '/' && [path, ...owns].some(prefix => underPrefix(pathname, prefix)),
  )?.path ?? '/';
}

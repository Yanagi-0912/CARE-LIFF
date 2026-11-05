import { BellIcon, HeartPulseIcon, HomeIcon, LayoutGridIcon, SettingsIcon, type LucideIcon } from 'lucide-react';

type NavigationItem = {
  path: string;
  label: string;
  icon: LucideIcon;
  /** 其他也歸這個分頁的路徑前綴；深連結進來時底部導覽仍亮在對的格子。 */
  owns: readonly string[];
};

/** 手機底部導覽與桌機側欄共用的五個分頁，順序即畫面順序。 */
export const navigationItems: readonly NavigationItem[] = [
  { path: '/', label: 'nav.home', icon: HomeIcon, owns: ['/personalhealth', '/family', '/lost'] },
  { path: '/reminders', label: 'nav.reminders', icon: BellIcon, owns: ['/medications'] },
  { path: '/tools', label: 'nav.tools', icon: LayoutGridIcon,
    owns: ['/nearby-hospitals', '/clinic-visits', '/knowledge-reports', '/admin'] },
  { path: '/settings', label: 'nav.settings', icon: SettingsIcon, owns: [] },
  { path: '/health-records', label: 'nav.health', icon: HeartPulseIcon, owns: ['/personalhealth/consult'] },
];

const underPrefix = (pathname: string, prefix: string) =>
  prefix === '/' ? pathname === '/' : pathname === prefix || pathname.startsWith(`${prefix}/`);

/** 取最長的相符前綴：/personalhealth/consult 屬於「健康」，其餘 /personalhealth 屬於「首頁」。 */
export function activeNavigationPath(pathname: string) {
  let best = { path: '/', length: -1 };
  for (const { path, owns } of navigationItems) {
    for (const prefix of [path, ...owns]) {
      if (underPrefix(pathname, prefix) && prefix.length > best.length) best = { path, length: prefix.length };
    }
  }
  return best.path;
}

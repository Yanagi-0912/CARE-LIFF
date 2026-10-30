import { BellIcon, HeartIcon, HomeIcon, SettingsIcon, UsersIcon } from 'lucide-react';

/** 手機與 Web 共用目的地、圖示及所屬頁面判定。 */
export const navigationItems = [
  { path: '/personalhealth', label: 'nav.health', icon: HeartIcon },
  { path: '/reminders', label: 'nav.reminders', icon: BellIcon },
  { path: '/', label: 'nav.home', icon: HomeIcon },
  { path: '/family', label: 'nav.family', icon: UsersIcon },
  { path: '/settings', label: 'nav.settings', icon: SettingsIcon },
];

export function activeNavigationPath(pathname: string) {
  if (pathname.startsWith('/admin/')) return '/settings';
  if (pathname.startsWith('/lost/')) return '/family';
  return navigationItems.find(item => item.path !== '/' &&
    (pathname === item.path || pathname.startsWith(`${item.path}/`)))?.path ?? '/';
}

import type { SupportedLanguage } from './messages';

const keys = [
  'settings.overviewTitle', 'settings.overviewDesc', 'settings.displayTitle', 'settings.displayDesc',
  'settings.notificationsEntryDesc', 'settings.accountEntryDesc', 'settings.themeTitle', 'settings.themeDesc',
  'settings.theme.light', 'settings.theme.dark', 'settings.theme.system', 'settings.teamName', 'settings.appVersion',
] as const;

const copy: Record<SupportedLanguage, string[]> = {
  'zh-TW': [
    '用得更順手', '先選一個項目，再調整詳細設定。', '字體與顯示', '文字大小、語言、深淺色與高對比',
    '用藥、家人與健康資訊通知', '帳號資訊與登出', '顯示模式', '選擇淺色、深色，或跟隨裝置的設定。',
    '淺色', '深色', '跟隨系統', 'CARE 團隊', '1.0.0',
  ],
  en: [
    'Make CARE work for you', 'Choose a category to adjust its settings.', 'Text and display', 'Text size, language, appearance and contrast',
    'Medication, family and health news notifications', 'Account information and sign out', 'Appearance', 'Choose light, dark, or your device settings.',
    'Light', 'Dark', 'System', 'CARE Team', '1.0.0',
  ],
  id: [
    'Sesuaikan CARE untuk Anda', 'Pilih kategori untuk mengatur preferensi.', 'Teks dan tampilan', 'Ukuran teks, bahasa, tampilan dan kontras',
    'Notifikasi obat, keluarga dan informasi kesehatan', 'Informasi akun dan keluar', 'Mode tampilan', 'Pilih terang, gelap, atau ikuti pengaturan perangkat.',
    'Terang', 'Gelap', 'Sistem', 'Tim CARE', '1.0.0',
  ],
  vi: [
    'Điều chỉnh CARE cho bạn', 'Chọn một mục để điều chỉnh cài đặt.', 'Chữ và hiển thị', 'Cỡ chữ, ngôn ngữ, giao diện và độ tương phản',
    'Thông báo thuốc, gia đình và tin sức khỏe', 'Thông tin tài khoản và đăng xuất', 'Chế độ hiển thị', 'Chọn sáng, tối hoặc theo cài đặt thiết bị.',
    'Sáng', 'Tối', 'Hệ thống', 'Nhóm CARE', '1.0.0',
  ],
  th: [
    'ปรับ CARE ให้เหมาะกับคุณ', 'เลือกหมวดหมู่เพื่อปรับการตั้งค่า', 'ข้อความและการแสดงผล', 'ขนาดข้อความ ภาษา รูปแบบและความคมชัด',
    'การแจ้งเตือนยา ครอบครัว และข่าวสุขภาพ', 'ข้อมูลบัญชีและออกจากระบบ', 'โหมดการแสดงผล', 'เลือกโหมดสว่าง มืด หรือตามการตั้งค่าอุปกรณ์',
    'สว่าง', 'มืด', 'ตามระบบ', 'ทีม CARE', '1.0.0',
  ],
  ja: [
    'CAREを使いやすく', '項目を選んで設定を調整できます。', '文字と表示', '文字サイズ・言語・表示モード・コントラスト',
    '服薬・家族・健康情報の通知', 'アカウント情報とログアウト', '表示モード', 'ライト、ダーク、または端末の設定に合わせます。',
    'ライト', 'ダーク', 'システム', 'CAREチーム', '1.0.0',
  ],
};

export const settingsNavigationMessages = Object.fromEntries(
  Object.entries(copy).map(([language, values]) => [language,
    Object.fromEntries(keys.map((key, index) => [key, values[index]])),
  ]),
) as Record<SupportedLanguage, Record<string, string>>;

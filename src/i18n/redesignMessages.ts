import type { SupportedLanguage } from './messages';

/** Figma「CARE｜產品 UI 與互動原型」四分頁版面新增或改寫的文案；最後合併，會蓋過同名舊字串。 */
export const redesignMessages: Record<SupportedLanguage, Record<string, string>> = {
  'zh-TW': {
    'consultRecord.backToRecords': '返回健康紀錄',
    'nav.tools': '工具',
    'tools.title': '健康工具',
    'tools.clinicVisits': '看診錄音與摘要',
    'tools.adminOnly': '管理員專用',
  },
  en: {
    'consultRecord.backToRecords': 'Back to health records',
    'nav.tools': 'Tools',
    'tools.title': 'Health tools',
    'tools.clinicVisits': 'Visit recordings',
    'tools.adminOnly': 'Administrators only',
  },
  id: {
    'consultRecord.backToRecords': 'Kembali ke catatan kesehatan',
    'nav.tools': 'Alat',
    'tools.title': 'Alat kesehatan',
    'tools.clinicVisits': 'Rekaman kunjungan',
    'tools.adminOnly': 'Khusus admin',
  },
  vi: {
    'consultRecord.backToRecords': 'Quay lại hồ sơ sức khỏe',
    'nav.tools': 'Công cụ',
    'tools.title': 'Công cụ sức khỏe',
    'tools.clinicVisits': 'Ghi âm buổi khám',
    'tools.adminOnly': 'Chỉ dành cho quản trị viên',
  },
  th: {
    'consultRecord.backToRecords': 'กลับไปที่บันทึกสุขภาพ',
    'nav.tools': 'เครื่องมือ',
    'tools.title': 'เครื่องมือสุขภาพ',
    'tools.clinicVisits': 'บันทึกเสียงการพบแพทย์',
    'tools.adminOnly': 'สำหรับผู้ดูแลระบบเท่านั้น',
  },
  ja: {
    'consultRecord.backToRecords': '健康記録に戻る',
    'nav.tools': 'ツール',
    'tools.title': '健康ツール',
    'tools.clinicVisits': '診察の録音と要約',
    'tools.adminOnly': '管理者専用',
  },
};

import type { SupportedLanguage } from './messages';

/** Figma「CARE｜產品 UI 與互動原型」四分頁版面新增或改寫的文案；最後合併，會蓋過同名舊字串。 */
export const redesignMessages: Record<SupportedLanguage, Record<string, string>> = {
  'zh-TW': {
    'consultRecord.backToRecords': '返回健康紀錄',
    'nav.tools': '工具',
    'tools.title': '健康工具',
    'tools.healthRecords': '我的健康紀錄',
    'tools.clinicVisits': '看診錄音與摘要',
    'tools.visitsShort': '依看診整理藥袋與處方',
    'tools.adminOnly': '管理員專用',
  },
  en: {
    'consultRecord.backToRecords': 'Back to health records',
    'nav.tools': 'Tools',
    'tools.title': 'Health tools',
    'tools.healthRecords': 'My health records',
    'tools.clinicVisits': 'Visit recordings',
    'tools.visitsShort': 'Medicine bags and prescriptions by visit',
    'tools.adminOnly': 'Administrators only',
  },
  id: {
    'consultRecord.backToRecords': 'Kembali ke catatan kesehatan',
    'nav.tools': 'Alat',
    'tools.title': 'Alat kesehatan',
    'tools.healthRecords': 'Catatan kesehatan saya',
    'tools.clinicVisits': 'Rekaman kunjungan',
    'tools.visitsShort': 'Kantong obat dan resep per kunjungan',
    'tools.adminOnly': 'Khusus admin',
  },
  vi: {
    'consultRecord.backToRecords': 'Quay lại hồ sơ sức khỏe',
    'nav.tools': 'Công cụ',
    'tools.title': 'Công cụ sức khỏe',
    'tools.healthRecords': 'Hồ sơ sức khỏe của tôi',
    'tools.clinicVisits': 'Ghi âm buổi khám',
    'tools.visitsShort': 'Túi thuốc và đơn thuốc theo lần khám',
    'tools.adminOnly': 'Chỉ dành cho quản trị viên',
  },
  th: {
    'consultRecord.backToRecords': 'กลับไปที่บันทึกสุขภาพ',
    'nav.tools': 'เครื่องมือ',
    'tools.title': 'เครื่องมือสุขภาพ',
    'tools.healthRecords': 'บันทึกสุขภาพของฉัน',
    'tools.clinicVisits': 'บันทึกเสียงการพบแพทย์',
    'tools.visitsShort': 'ซองยาและใบสั่งยาตามการพบแพทย์',
    'tools.adminOnly': 'สำหรับผู้ดูแลระบบเท่านั้น',
  },
  ja: {
    'consultRecord.backToRecords': '健康記録に戻る',
    'nav.tools': 'ツール',
    'tools.title': '健康ツール',
    'tools.healthRecords': '私の健康記録',
    'tools.clinicVisits': '診察の録音と要約',
    'tools.visitsShort': '受診ごとの薬袋と処方',
    'tools.adminOnly': '管理者専用',
  },
};

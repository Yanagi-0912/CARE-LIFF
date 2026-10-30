import type { SupportedLanguage } from './messages';

const keys = ['featureNav.remindersDesc', 'featureNav.medicationsDesc', 'featureNav.appointmentsDesc',
  'featureNav.record.blood_pressure', 'featureNav.record.blood_glucose', 'featureNav.record.menstrual', 'featureNav.record.steps'] as const;
const copy: Record<SupportedLanguage, string[]> = {
  'zh-TW': ['管理用藥與掛號，查看提醒紀錄。', '管理藥品、藥單與服藥時間', '管理看診日期與掛號提醒', '新增量測、查看紀錄與提醒範圍', '記錄血糖，查看量測變化', '記錄經期與身體狀況', '開始計步，查看每日步數'],
  en: ['Manage medicines, appointments and reminder history.', 'Manage medicines, prescriptions and dose times', 'Manage appointments and visit reminders', 'Add measurements, view history and alert limits', 'Record glucose and review measurements', 'Record your cycle and symptoms', 'Start counting and view daily steps'],
  id: ['Kelola obat, janji temu, dan riwayat pengingat.', 'Kelola obat, resep, dan waktu minum obat', 'Kelola janji temu dan pengingat kunjungan', 'Tambah pengukuran, lihat riwayat dan batas peringatan', 'Catat gula darah dan lihat pengukuran', 'Catat siklus haid dan gejala', 'Mulai menghitung dan lihat langkah harian'],
  vi: ['Quản lý thuốc, lịch khám và lịch sử nhắc nhở.', 'Quản lý thuốc, đơn thuốc và giờ uống', 'Quản lý lịch khám và nhắc hẹn', 'Thêm số đo, xem lịch sử và ngưỡng cảnh báo', 'Ghi đường huyết và xem số đo', 'Ghi chu kỳ kinh nguyệt và triệu chứng', 'Bắt đầu đếm và xem số bước hằng ngày'],
  th: ['จัดการยา นัดหมาย และประวัติการแจ้งเตือน', 'จัดการยา ใบสั่งยา และเวลารับประทาน', 'จัดการนัดหมายและการเตือนพบแพทย์', 'เพิ่มค่าที่วัด ดูประวัติและเกณฑ์แจ้งเตือน', 'บันทึกน้ำตาลในเลือดและดูค่าที่วัด', 'บันทึกรอบเดือนและอาการ', 'เริ่มนับและดูจำนวนก้าวรายวัน'],
  ja: ['服薬・予約と通知履歴を管理します。', '薬・処方箋・服用時刻を管理', '診察予約と通知を管理', '測定値の追加・履歴・通知の範囲を確認', '血糖値を記録し測定値を確認', '生理周期と体調を記録', '歩数計を開始し毎日の歩数を確認'],
};
export const featureNavigationMessages = Object.fromEntries(Object.entries(copy).map(([language, values]) =>
  [language, Object.fromEntries(keys.map((key, index) => [key, values[index]]))],
)) as Record<SupportedLanguage, Record<string, string>>;

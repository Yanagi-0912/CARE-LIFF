import type { SupportedLanguage } from './messages';

const keys = [
  'header.brand', 'header.tagline', 'home.introTitle', 'home.introDesc',
  'home.nearbyTitle', 'home.nearbyShort', 'home.recordsShort', 'home.clinicShort', 'home.reportsShort',
  'personalHealth.overviewTitle', 'personalHealth.overviewDesc', 'personalHealth.details',
  'personalHealth.edit', 'personalHealth.notProvided', 'personalHealth.ageNotSet',
  'personalHealth.avatarFallback', 'personalHealth.consultDesc', 'personalHealth.return',
  'personalHealth.cancel', 'personalHealth.historyHint', 'personalHealth.requiredHint',
] as const;

const copy: Record<SupportedLanguage, string[]> = {
  'zh-TW': [
    'CARE', '健康管家', '今天需要什麼幫忙？', '選一項服務，查看完整內容。',
    '附近醫療', '醫院、診所與藥局', '量測數字與日常紀錄', '逐字稿與看診摘要', '查看問題審核進度',
    '個人健康', '查看個人資料與諮詢紀錄。', '詳細個人資料', '編輯個人資料', '尚未填寫', '年齡尚未填寫',
    '我', '回顧過去的健康諮詢', '返回', '取消', '慢性病、重大傷病與開刀紀錄，可留空。', '請完成必填欄位後儲存。',
  ],
  en: [
    'CARE', 'Health companion', 'How can we help today?', 'Choose a service to see more.',
    'Nearby care', 'Hospitals, clinics and pharmacies', 'Measurements and daily records', 'Transcripts and visit summaries', 'Check your report review progress',
    'Personal health', 'View your profile and consultation history.', 'Profile details', 'Edit profile', 'Not provided', 'Age not provided',
    'Me', 'Review past health consultations', 'Back', 'Cancel', 'Chronic conditions, major illnesses and surgeries. Optional.', 'Complete required fields before saving.',
  ],
  id: [
    'CARE', 'Pendamping kesehatan', 'Perlu bantuan apa hari ini?', 'Pilih layanan untuk melihat selengkapnya.',
    'Layanan terdekat', 'Rumah sakit, klinik dan apotek', 'Pengukuran dan catatan harian', 'Transkrip dan ringkasan kunjungan', 'Lihat perkembangan peninjauan laporan',
    'Kesehatan pribadi', 'Lihat profil dan riwayat konsultasi.', 'Detail profil', 'Edit profil', 'Belum diisi', 'Usia belum diisi',
    'Saya', 'Lihat kembali konsultasi kesehatan', 'Kembali', 'Batal', 'Penyakit kronis, penyakit berat dan operasi. Opsional.', 'Lengkapi kolom wajib sebelum menyimpan.',
  ],
  vi: [
    'CARE', 'Đồng hành sức khỏe', 'Hôm nay bạn cần hỗ trợ gì?', 'Chọn một dịch vụ để xem chi tiết.',
    'Y tế gần đây', 'Bệnh viện, phòng khám và nhà thuốc', 'Số đo và nhật ký hằng ngày', 'Bản ghi và tóm tắt khám bệnh', 'Xem tiến độ duyệt báo cáo',
    'Sức khỏe cá nhân', 'Xem hồ sơ và lịch sử tư vấn.', 'Chi tiết hồ sơ', 'Chỉnh sửa hồ sơ', 'Chưa điền', 'Chưa điền tuổi',
    'Tôi', 'Xem lại các tư vấn sức khỏe', 'Quay lại', 'Hủy', 'Bệnh mạn tính, bệnh nặng và phẫu thuật. Có thể để trống.', 'Điền các mục bắt buộc trước khi lưu.',
  ],
  th: [
    'CARE', 'เพื่อนดูแลสุขภาพ', 'วันนี้ต้องการความช่วยเหลืออะไร?', 'เลือกบริการเพื่อดูรายละเอียด',
    'สถานพยาบาลใกล้เคียง', 'โรงพยาบาล คลินิก และร้านขายยา', 'ค่าการวัดและบันทึกประจำวัน', 'ข้อความถอดเสียงและสรุปการพบแพทย์', 'ดูความคืบหน้าการตรวจสอบรายงาน',
    'สุขภาพส่วนตัว', 'ดูข้อมูลส่วนตัวและประวัติการปรึกษา', 'รายละเอียดข้อมูลส่วนตัว', 'แก้ไขข้อมูลส่วนตัว', 'ยังไม่ได้กรอก', 'ยังไม่ได้กรอกอายุ',
    'ฉัน', 'ทบทวนการปรึกษาสุขภาพที่ผ่านมา', 'กลับ', 'ยกเลิก', 'โรคเรื้อรัง โรคร้ายแรง และการผ่าตัด เว้นว่างได้', 'กรอกข้อมูลที่จำเป็นก่อนบันทึก',
  ],
  ja: [
    'CARE', '健康パートナー', '今日は何をお手伝いしましょうか？', 'サービスを選んで詳細を確認できます。',
    '近くの医療機関', '病院・診療所・薬局', '測定値と日々の記録', '文字起こしと診察の要約', '報告の審査状況を確認',
    '個人の健康', '個人情報と相談履歴を確認できます。', '個人情報の詳細', '個人情報を編集', '未記入', '年齢は未記入',
    '私', '過去の健康相談を振り返る', '戻る', 'キャンセル', '慢性疾患・重大な病歴・手術歴。空欄でも構いません。', '必須項目を入力してから保存してください。',
  ],
};

export const uiRefreshMessages = Object.fromEntries(
  Object.entries(copy).map(([language, values]) => [language,
    Object.fromEntries(keys.map((key, index) => [key, values[index]])),
  ]),
) as Record<SupportedLanguage, Record<string, string>>;

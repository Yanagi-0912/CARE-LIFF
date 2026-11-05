import type { SupportedLanguage } from './messages';

export const familyNavigationMessages: Record<SupportedLanguage, Record<string, string>> = {
  'zh-TW': {
    'familyNavigation.permissions': '照護權限',
    'familyNavigation.location': '家人位置',
    'familyNavigation.locationSelect': '選擇一位家人，查看位置分享。',
    'familyNavigation.locationNotice': '位置分享由家人在 LINE 發出求救後開始，只有通報收件人可以查看。選擇家人後會確認是否有分享及查看權限。',
    'familyNavigation.locationOpen': '查看位置分享',
  },
  en: {
    'familyNavigation.permissions': 'Care permissions',
    'familyNavigation.location': 'Family locations',
    'familyNavigation.locationSelect': 'Choose a family member to view location sharing.',
    'familyNavigation.locationNotice': 'Location sharing starts after a family member asks for help in LINE. Only alert recipients can view it. Availability and access are checked after you select a family member.',
    'familyNavigation.locationOpen': 'View location sharing',
  },
  id: {
    'familyNavigation.permissions': 'Izin perawatan',
    'familyNavigation.location': 'Lokasi keluarga',
    'familyNavigation.locationSelect': 'Pilih anggota keluarga untuk melihat berbagi lokasi.',
    'familyNavigation.locationNotice': 'Berbagi lokasi dimulai setelah anggota keluarga meminta bantuan di LINE. Hanya penerima peringatan yang dapat melihatnya. Ketersediaan dan izin akan diperiksa setelah Anda memilih anggota keluarga.',
    'familyNavigation.locationOpen': 'Lihat berbagi lokasi',
  },
  vi: {
    'familyNavigation.permissions': 'Quyền chăm sóc',
    'familyNavigation.location': 'Vị trí người thân',
    'familyNavigation.locationSelect': 'Chọn người thân để xem chia sẻ vị trí.',
    'familyNavigation.locationNotice': 'Chia sẻ vị trí bắt đầu sau khi người thân yêu cầu trợ giúp trong LINE. Chỉ người nhận thông báo mới có thể xem. Tình trạng chia sẻ và quyền xem sẽ được kiểm tra sau khi bạn chọn người thân.',
    'familyNavigation.locationOpen': 'Xem chia sẻ vị trí',
  },
  th: {
    'familyNavigation.permissions': 'สิทธิ์ในการดูแล',
    'familyNavigation.location': 'ตำแหน่งคนในครอบครัว',
    'familyNavigation.locationSelect': 'เลือกคนในครอบครัวเพื่อดูการแชร์ตำแหน่ง',
    'familyNavigation.locationNotice': 'การแชร์ตำแหน่งเริ่มหลังจากคนในครอบครัวขอความช่วยเหลือใน LINE เฉพาะผู้รับการแจ้งเตือนเท่านั้นที่ดูได้ ระบบจะตรวจสอบการแชร์และสิทธิ์หลังจากท่านเลือกคนในครอบครัว',
    'familyNavigation.locationOpen': 'ดูการแชร์ตำแหน่ง',
  },
  ja: {
    'familyNavigation.permissions': 'ケアの権限',
    'familyNavigation.location': 'ご家族の位置',
    'familyNavigation.locationSelect': 'ご家族を選んで位置情報の共有を確認します。',
    'familyNavigation.locationNotice': '位置情報の共有は、ご家族がLINEで助けを求めた後に始まります。通知を受け取る方だけが閲覧できます。ご家族を選ぶと、共有の有無と閲覧権限を確認します。',
    'familyNavigation.locationOpen': '位置情報の共有を見る',
  },
};

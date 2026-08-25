type SupportedLanguage = 'zh-TW' | 'en' | 'id' | 'vi' | 'th' | 'ja';

/**
 * 家庭權限相關的文案。
 *
 * 兩個貫穿全部語言的原則：
 *
 * 1. 「沒有權限」與「載入失敗」必須講成兩件事。使用者看到「載入失敗」會一直
 *    重試，看到「沒有權限」才知道要去找長輩。
 * 2. 「未設定」與「設定為一般成員」必須講成兩件事。直接把未設定顯示成一般
 *    成員，擁有者會以為自己已經設定過了，於是永遠不會去設定。
 */
export const familyRoleMessages: Record<
  SupportedLanguage,
  Record<string, string>
> = {
  'zh-TW': {
    'familyRole.owner': '本人',
    'familyRole.guardian': '主要照顧者',
    'familyRole.caregiver': '協助照顧者',
    'familyRole.member': '一般家人',
    'familyRole.unassigned': '尚未設定',

    'familyRole.manage.title': '家人的權限',
    'familyRole.manage.desc': '您可以決定每位家人能看到、能幫您設定哪些資料。',
    'familyRole.manage.open': '設定家人權限',
    'familyRole.manage.saving': '儲存中…',
    'familyRole.manage.saved': '已更新 {{name}} 的權限',
    'familyRole.manage.saveError': '權限更新失敗，請稍後再試',
    'familyRole.manage.loadError': '無法載入權限設定',

    'familyRole.explain.guardian': '看得到您的健康狀況與對話紀錄，也能幫您設定用藥與健康資料。',
    'familyRole.explain.caregiver': '看得到您的健康狀況，能幫您設定用藥；看不到對話紀錄。',
    'familyRole.explain.member': '只看得到用藥時間與藥名，看不到健康狀況與對話紀錄。',

    'familyRole.unassignedNotice_one': '還有 {{count}} 位家人尚未設定權限，目前會以「一般家人」處理。',
    'familyRole.unassignedNotice_other': '還有 {{count}} 位家人尚未設定權限，目前會以「一般家人」處理。',
    'familyRole.assignmentComplete': '每位家人都已設定權限。',

    'familyPermission.noAccess': '您沒有查看這位家人資料的權限',
    'familyPermission.noSensitive': '您沒有查看健康狀況的權限',
    'familyPermission.noPrivate': '您沒有查看對話紀錄的權限',
    'familyPermission.askOwner': '需要的話，請家人在他的「家人的權限」裡調整。',

    'familyPermission.proxyEdit': '幫他填健康資料',
    'familyPermission.proxyEditTitle': '幫 {{name}} 填健康資料',
    'familyPermission.proxyEditDesc': '這些資料會存進他的健康檔案。姓名與照片由他本人設定，這裡不會更動。',
    'familyPermission.proxyEditSaved': '已更新 {{name}} 的健康資料',
    'familyPermission.proxyEditError': '代填失敗，請稍後再試',
    'familyPermission.save': '儲存',
    'familyPermission.cancel': '取消',
  },

  en: {
    'familyRole.owner': 'Themselves',
    'familyRole.guardian': 'Primary caregiver',
    'familyRole.caregiver': 'Assisting caregiver',
    'familyRole.member': 'Family member',
    'familyRole.unassigned': 'Not set yet',

    'familyRole.manage.title': "Your family's access",
    'familyRole.manage.desc': 'You decide what each family member can see and help you manage.',
    'familyRole.manage.open': 'Manage family access',
    'familyRole.manage.saving': 'Saving…',
    'familyRole.manage.saved': "Updated {{name}}'s access",
    'familyRole.manage.saveError': 'Could not update access. Please try again later.',
    'familyRole.manage.loadError': 'Could not load access settings',

    'familyRole.explain.guardian': 'Can see your health details and conversation records, and can manage your medicines and health information.',
    'familyRole.explain.caregiver': 'Can see your health details and manage your medicines, but not your conversation records.',
    'familyRole.explain.member': 'Can only see medicine names and times, not your health details or conversation records.',

    'familyRole.unassignedNotice_one': '{{count}} family member has no access set yet and is treated as a general family member for now.',
    'familyRole.unassignedNotice_other': '{{count}} family members have no access set yet and are treated as general family members for now.',
    'familyRole.assignmentComplete': 'Access is set for every family member.',

    'familyPermission.noAccess': "You don't have permission to view this family member's information",
    'familyPermission.noSensitive': "You don't have permission to view health details",
    'familyPermission.noPrivate': "You don't have permission to view conversation records",
    'familyPermission.askOwner': 'If you need access, ask them to adjust it under "Your family\'s access".',

    'familyPermission.proxyEdit': 'Fill in their health information',
    'familyPermission.proxyEditTitle': "Fill in {{name}}'s health information",
    'familyPermission.proxyEditDesc': 'This is saved to their health record. Their name and photo are set by them and are not changed here.',
    'familyPermission.proxyEditSaved': "Updated {{name}}'s health information",
    'familyPermission.proxyEditError': 'Could not save. Please try again later.',
    'familyPermission.save': 'Save',
    'familyPermission.cancel': 'Cancel',
  },

  id: {
    'familyRole.owner': 'Diri sendiri',
    'familyRole.guardian': 'Pengasuh utama',
    'familyRole.caregiver': 'Pengasuh pendamping',
    'familyRole.member': 'Anggota keluarga',
    'familyRole.unassigned': 'Belum diatur',

    'familyRole.manage.title': 'Akses keluarga Anda',
    'familyRole.manage.desc': 'Anda menentukan apa yang dapat dilihat dan dibantu oleh setiap anggota keluarga.',
    'familyRole.manage.open': 'Atur akses keluarga',
    'familyRole.manage.saving': 'Menyimpan…',
    'familyRole.manage.saved': 'Akses {{name}} diperbarui',
    'familyRole.manage.saveError': 'Gagal memperbarui akses. Coba lagi nanti.',
    'familyRole.manage.loadError': 'Gagal memuat pengaturan akses',

    'familyRole.explain.guardian': 'Dapat melihat kondisi kesehatan dan catatan percakapan Anda, serta membantu mengatur obat dan data kesehatan.',
    'familyRole.explain.caregiver': 'Dapat melihat kondisi kesehatan dan membantu mengatur obat, tetapi tidak melihat catatan percakapan.',
    'familyRole.explain.member': 'Hanya dapat melihat nama dan waktu obat, tidak kondisi kesehatan atau catatan percakapan.',

    'familyRole.unassignedNotice_one': '{{count}} anggota keluarga belum diatur aksesnya dan untuk sementara diperlakukan sebagai anggota keluarga biasa.',
    'familyRole.unassignedNotice_other': '{{count}} anggota keluarga belum diatur aksesnya dan untuk sementara diperlakukan sebagai anggota keluarga biasa.',
    'familyRole.assignmentComplete': 'Akses sudah diatur untuk semua anggota keluarga.',

    'familyPermission.noAccess': 'Anda tidak memiliki izin untuk melihat data anggota keluarga ini',
    'familyPermission.noSensitive': 'Anda tidak memiliki izin untuk melihat kondisi kesehatan',
    'familyPermission.noPrivate': 'Anda tidak memiliki izin untuk melihat catatan percakapan',
    'familyPermission.askOwner': 'Jika perlu, minta dia menyesuaikannya di "Akses keluarga Anda".',

    'familyPermission.proxyEdit': 'Isikan data kesehatannya',
    'familyPermission.proxyEditTitle': 'Isi data kesehatan {{name}}',
    'familyPermission.proxyEditDesc': 'Data ini disimpan ke catatan kesehatannya. Nama dan fotonya diatur olehnya sendiri dan tidak diubah di sini.',
    'familyPermission.proxyEditSaved': 'Data kesehatan {{name}} diperbarui',
    'familyPermission.proxyEditError': 'Gagal menyimpan. Coba lagi nanti.',
    'familyPermission.save': 'Simpan',
    'familyPermission.cancel': 'Batal',
  },

  vi: {
    'familyRole.owner': 'Chính mình',
    'familyRole.guardian': 'Người chăm sóc chính',
    'familyRole.caregiver': 'Người hỗ trợ chăm sóc',
    'familyRole.member': 'Thành viên gia đình',
    'familyRole.unassigned': 'Chưa thiết lập',

    'familyRole.manage.title': 'Quyền của người thân',
    'familyRole.manage.desc': 'Bạn quyết định mỗi người thân được xem và giúp bạn thiết lập những gì.',
    'familyRole.manage.open': 'Thiết lập quyền người thân',
    'familyRole.manage.saving': 'Đang lưu…',
    'familyRole.manage.saved': 'Đã cập nhật quyền của {{name}}',
    'familyRole.manage.saveError': 'Không cập nhật được quyền. Vui lòng thử lại sau.',
    'familyRole.manage.loadError': 'Không tải được thiết lập quyền',

    'familyRole.explain.guardian': 'Xem được tình trạng sức khoẻ và lịch sử trò chuyện của bạn, đồng thời giúp bạn thiết lập thuốc và dữ liệu sức khoẻ.',
    'familyRole.explain.caregiver': 'Xem được tình trạng sức khoẻ và giúp thiết lập thuốc, nhưng không xem được lịch sử trò chuyện.',
    'familyRole.explain.member': 'Chỉ xem được tên thuốc và giờ uống, không xem được tình trạng sức khoẻ hay lịch sử trò chuyện.',

    'familyRole.unassignedNotice_one': 'Còn {{count}} người thân chưa được thiết lập quyền, hiện tạm xử lý như thành viên gia đình thường.',
    'familyRole.unassignedNotice_other': 'Còn {{count}} người thân chưa được thiết lập quyền, hiện tạm xử lý như thành viên gia đình thường.',
    'familyRole.assignmentComplete': 'Mọi người thân đều đã được thiết lập quyền.',

    'familyPermission.noAccess': 'Bạn không có quyền xem dữ liệu của người thân này',
    'familyPermission.noSensitive': 'Bạn không có quyền xem tình trạng sức khoẻ',
    'familyPermission.noPrivate': 'Bạn không có quyền xem lịch sử trò chuyện',
    'familyPermission.askOwner': 'Nếu cần, hãy nhờ người thân điều chỉnh trong mục "Quyền của người thân".',

    'familyPermission.proxyEdit': 'Điền dữ liệu sức khoẻ giúp họ',
    'familyPermission.proxyEditTitle': 'Điền dữ liệu sức khoẻ cho {{name}}',
    'familyPermission.proxyEditDesc': 'Dữ liệu này được lưu vào hồ sơ sức khoẻ của họ. Tên và ảnh do chính họ thiết lập, ở đây không thay đổi.',
    'familyPermission.proxyEditSaved': 'Đã cập nhật dữ liệu sức khoẻ của {{name}}',
    'familyPermission.proxyEditError': 'Lưu không thành công. Vui lòng thử lại sau.',
    'familyPermission.save': 'Lưu',
    'familyPermission.cancel': 'Huỷ',
  },

  th: {
    'familyRole.owner': 'ตัวท่านเอง',
    'familyRole.guardian': 'ผู้ดูแลหลัก',
    'familyRole.caregiver': 'ผู้ช่วยดูแล',
    'familyRole.member': 'สมาชิกครอบครัว',
    'familyRole.unassigned': 'ยังไม่ได้ตั้งค่า',

    'familyRole.manage.title': 'สิทธิ์ของคนในครอบครัว',
    'familyRole.manage.desc': 'ท่านเป็นผู้กำหนดว่าแต่ละคนดูอะไรได้ และช่วยตั้งค่าอะไรให้ท่านได้',
    'familyRole.manage.open': 'ตั้งค่าสิทธิ์ของครอบครัว',
    'familyRole.manage.saving': 'กำลังบันทึก…',
    'familyRole.manage.saved': 'อัปเดตสิทธิ์ของ {{name}} แล้ว',
    'familyRole.manage.saveError': 'อัปเดตสิทธิ์ไม่สำเร็จ กรุณาลองใหม่ภายหลัง',
    'familyRole.manage.loadError': 'โหลดการตั้งค่าสิทธิ์ไม่สำเร็จ',

    'familyRole.explain.guardian': 'ดูสภาพสุขภาพและบันทึกการสนทนาของท่านได้ และช่วยตั้งค่ายาและข้อมูลสุขภาพให้ท่านได้',
    'familyRole.explain.caregiver': 'ดูสภาพสุขภาพและช่วยตั้งค่ายาได้ แต่ดูบันทึกการสนทนาไม่ได้',
    'familyRole.explain.member': 'ดูได้เฉพาะชื่อยาและเวลาที่ต้องกิน ดูสภาพสุขภาพและบันทึกการสนทนาไม่ได้',

    'familyRole.unassignedNotice_one': 'ยังมีคนในครอบครัว {{count}} คนที่ยังไม่ได้ตั้งค่าสิทธิ์ ขณะนี้จะถือเป็นสมาชิกครอบครัวทั่วไป',
    'familyRole.unassignedNotice_other': 'ยังมีคนในครอบครัว {{count}} คนที่ยังไม่ได้ตั้งค่าสิทธิ์ ขณะนี้จะถือเป็นสมาชิกครอบครัวทั่วไป',
    'familyRole.assignmentComplete': 'ตั้งค่าสิทธิ์ให้ทุกคนในครอบครัวแล้ว',

    'familyPermission.noAccess': 'ท่านไม่มีสิทธิ์ดูข้อมูลของคนในครอบครัวรายนี้',
    'familyPermission.noSensitive': 'ท่านไม่มีสิทธิ์ดูสภาพสุขภาพ',
    'familyPermission.noPrivate': 'ท่านไม่มีสิทธิ์ดูบันทึกการสนทนา',
    'familyPermission.askOwner': 'หากจำเป็น กรุณาให้เจ้าตัวปรับในหัวข้อ "สิทธิ์ของคนในครอบครัว"',

    'familyPermission.proxyEdit': 'ช่วยกรอกข้อมูลสุขภาพให้',
    'familyPermission.proxyEditTitle': 'กรอกข้อมูลสุขภาพให้ {{name}}',
    'familyPermission.proxyEditDesc': 'ข้อมูลนี้จะถูกบันทึกลงในระเบียนสุขภาพของเขา ชื่อและรูปภาพเจ้าตัวเป็นผู้ตั้งค่า และจะไม่ถูกแก้ไขที่นี่',
    'familyPermission.proxyEditSaved': 'อัปเดตข้อมูลสุขภาพของ {{name}} แล้ว',
    'familyPermission.proxyEditError': 'บันทึกไม่สำเร็จ กรุณาลองใหม่ภายหลัง',
    'familyPermission.save': 'บันทึก',
    'familyPermission.cancel': 'ยกเลิก',
  },

  ja: {
    'familyRole.owner': 'ご本人',
    'familyRole.guardian': '主な介護者',
    'familyRole.caregiver': '介護の補助者',
    'familyRole.member': 'ご家族',
    'familyRole.unassigned': '未設定',

    'familyRole.manage.title': 'ご家族の権限',
    'familyRole.manage.desc': 'どのご家族が何を見られるか、何を代わりに設定できるかを決められます。',
    'familyRole.manage.open': 'ご家族の権限を設定',
    'familyRole.manage.saving': '保存しています…',
    'familyRole.manage.saved': '{{name}} さんの権限を更新しました',
    'familyRole.manage.saveError': '権限を更新できませんでした。しばらくしてからお試しください。',
    'familyRole.manage.loadError': '権限の設定を読み込めませんでした',

    'familyRole.explain.guardian': '健康状態と会話の記録を見ることができ、お薬や健康情報の設定も代わりに行えます。',
    'familyRole.explain.caregiver': '健康状態を見ることができ、お薬の設定も行えます。会話の記録は見られません。',
    'familyRole.explain.member': 'お薬の名前と時間だけが見えます。健康状態と会話の記録は見られません。',

    'familyRole.unassignedNotice_one': '権限が未設定のご家族が {{count}} 名います。現在は「ご家族」として扱われます。',
    'familyRole.unassignedNotice_other': '権限が未設定のご家族が {{count}} 名います。現在は「ご家族」として扱われます。',
    'familyRole.assignmentComplete': 'すべてのご家族の権限が設定されています。',

    'familyPermission.noAccess': 'このご家族の情報を見る権限がありません',
    'familyPermission.noSensitive': '健康状態を見る権限がありません',
    'familyPermission.noPrivate': '会話の記録を見る権限がありません',
    'familyPermission.askOwner': '必要な場合は、ご本人に「ご家族の権限」から調整してもらってください。',

    'familyPermission.proxyEdit': '健康情報を代わりに入力',
    'familyPermission.proxyEditTitle': '{{name}} さんの健康情報を入力',
    'familyPermission.proxyEditDesc': 'この内容はご本人の健康記録に保存されます。お名前と写真はご本人が設定するもので、ここでは変更されません。',
    'familyPermission.proxyEditSaved': '{{name}} さんの健康情報を更新しました',
    'familyPermission.proxyEditError': '保存できませんでした。しばらくしてからお試しください。',
    'familyPermission.save': '保存',
    'familyPermission.cancel': 'キャンセル',
  },
};

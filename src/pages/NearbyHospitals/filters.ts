/**
 * 附近搜尋的快捷篩選選項。
 *
 * `value` 一律是中文原文，因為它是**送給後端的值**，不是給人看的字：後端
 * `department_matcher` / `facility_type_matcher` 的別名表以中文為 key，
 * 把「內科」翻成 "Internal medicine" 再送出去，查表會直接落空並回報「看不懂」。
 * 顯示文字走 `labelKey`，由 i18n 決定。
 *
 * 科別清單只收「使用者會主動想找、且資料庫實際存在」的部定專科；「中醫」是
 * 別名（對應「中醫一般科」），刻意保留使用者的說法而非填正式名稱——後端本來就會
 * 做這層對應，並在結果裡回報 is_alias 讓畫面誠實揭露。
 */
export interface FilterOption {
  /** 送給後端的值。空字串代表不加這個條件。 */
  value: string;
  labelKey: string;
}

export const FACILITY_TYPE_OPTIONS: FilterOption[] = [
  { value: '', labelKey: 'nearby.typeAny' },
  { value: '醫院', labelKey: 'nearby.typeHospital' },
  { value: '診所', labelKey: 'nearby.typeClinic' },
  { value: '藥局', labelKey: 'nearby.typePharmacy' },
];

export const DEPARTMENT_OPTIONS: FilterOption[] = [
  { value: '內科', labelKey: 'nearby.dept.internal' },
  { value: '外科', labelKey: 'nearby.dept.surgery' },
  { value: '兒科', labelKey: 'nearby.dept.pediatrics' },
  { value: '牙科', labelKey: 'nearby.dept.dental' },
  { value: '中醫', labelKey: 'nearby.dept.chineseMedicine' },
  { value: '耳鼻喉科', labelKey: 'nearby.dept.ent' },
  { value: '眼科', labelKey: 'nearby.dept.eye' },
  { value: '皮膚科', labelKey: 'nearby.dept.dermatology' },
  { value: '婦產科', labelKey: 'nearby.dept.obgyn' },
  { value: '骨科', labelKey: 'nearby.dept.orthopedics' },
  { value: '家醫科', labelKey: 'nearby.dept.familyMedicine' },
  { value: '復健科', labelKey: 'nearby.dept.rehabilitation' },
];

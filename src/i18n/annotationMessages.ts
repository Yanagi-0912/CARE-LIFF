import type { SupportedLanguage } from './messages';

export const annotationMessages: Record<SupportedLanguage, Record<string, string>> = {
  'zh-TW': { 'sidebar.annotations': '標記頁面', 'home.annotationsDesc': '協助標註研究資料，接續自己的進度' },
  en: { 'sidebar.annotations': 'Data Annotation', 'home.annotationsDesc': 'Label research data and resume your progress' },
  id: { 'sidebar.annotations': 'Anotasi Data', 'home.annotationsDesc': 'Beri label data penelitian dan lanjutkan progres Anda' },
  vi: { 'sidebar.annotations': 'Gán nhãn dữ liệu', 'home.annotationsDesc': 'Gán nhãn dữ liệu nghiên cứu và tiếp tục tiến độ của bạn' },
  th: { 'sidebar.annotations': 'กำกับข้อมูล', 'home.annotationsDesc': 'ช่วยกำกับข้อมูลวิจัยและทำต่อจากความคืบหน้าของคุณ' },
  ja: { 'sidebar.annotations': 'データ注釈', 'home.annotationsDesc': '研究データを分類し、前回の続きから再開' },
};

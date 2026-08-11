import i18n, { getInitialLanguage, isSupportedLanguage } from '../i18n';

describe('多語系初始化邏輯', () => {
  beforeEach(() => {
    localStorage.clear();
    void i18n.changeLanguage('zh-TW');
  });

  it('當 localStorage 是支援語言時，應回傳該語言', () => {
    localStorage.setItem('care-settings', JSON.stringify({ language: 'vi' }));
    expect(getInitialLanguage('care-settings')).toBe('vi');
  });

  it('當語言不支援時，應回退到 zh-TW', () => {
    localStorage.setItem('care-settings', JSON.stringify({ language: 'fr' }));
    expect(getInitialLanguage('care-settings')).toBe('zh-TW');
  });

  it('當 localStorage 格式損壞時，應回退到 zh-TW', () => {
    localStorage.setItem('care-settings', '{broken-json');
    expect(getInitialLanguage('care-settings')).toBe('zh-TW');
  });

  it('應正確判斷語言是否為支援清單', () => {
    expect(isSupportedLanguage('en')).toBe(true);
    expect(isSupportedLanguage('zh-TW')).toBe(true);
    expect(isSupportedLanguage('fr')).toBe(false);
  });

  it('changeLanguage 後 t() 應回傳對應語言文案', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('settings.title')).toBe('Settings');
  });

  it('越南文包含知識回報頁的完整翻譯', async () => {
    await i18n.changeLanguage('vi');
    expect(i18n.t('home.knowledgeReports')).toBe('Báo cáo kiến thức');
    expect(i18n.t('knowledgeReports.status.reviewing')).toBe('Đang kiểm duyệt thủ công');
    expect(i18n.t('knowledgeReports.sample.question2')).not.toContain('高血壓');
  });

  it('回報表單與白名單錯誤文案六語齊備，不會退回中文', async () => {
    // 漏補語言時 i18n 會靜默退回 zh-TW 而不報錯，所以只能逐一核對。
    // 後端的錯誤 message 只有 zh-TW／en，這也是表單改依 code 自組文案的原因。
    const keys = [
      'knowledgeReports.form.open',
      'knowledgeReports.form.urlLabel',
      'knowledgeReports.form.urlHint',
      'knowledgeReports.form.noteLabel',
      'knowledgeReports.form.submit',
      'knowledgeReports.form.error.urlNotAllowed',
      'knowledgeReports.form.error.urlDomainNotAllowed',
      'knowledgeReports.form.error.urlInvalid',
      'knowledgeReports.form.error.quotaExceeded',
      'knowledgeReports.detail.sourceUrls',
      'knowledgeReports.detail.userNote',
    ];

    await i18n.changeLanguage('zh-TW');
    const zhValues = new Set(keys.map((key) => i18n.t(key)));

    // 日文與中文共用漢字，逐字比對才有意義：只要與 zh-TW 完全相同就是漏補
    for (const lang of ['en', 'id', 'vi', 'th', 'ja']) {
      await i18n.changeLanguage(lang);
      for (const key of keys) {
        const value = i18n.t(key);
        expect(value, `${lang} / ${key} 未翻譯`).not.toBe(key);
        expect(zhValues.has(value), `${lang} / ${key} 退回了 zh-TW`).toBe(false);
      }
    }

    await i18n.changeLanguage('vi');
    expect(i18n.t('knowledgeReports.form.error.quotaExceeded', { limit: 10 })).toContain('10');
  });

  it('個人健康頁文案支援英文與越南文', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('personalHealth.step1.title')).toBe('Basic info');
    expect(i18n.t('personalHealth.save')).toBe('Save');

    await i18n.changeLanguage('vi');
    expect(i18n.t('personalHealth.step1.title')).toBe('Thông tin cơ bản');
    expect(i18n.t('personalHealth.gender.male')).toBe('Nam');
  });
});

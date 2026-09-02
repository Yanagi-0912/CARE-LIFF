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

  it('附近醫院頁的新文案六語齊備，不會退回中文', async () => {
    // 這一頁新增了篩選、狀態標籤與「誠實揭露」的說明句。漏補語言時 i18n 會靜默
    // 退回 zh-TW 而不報錯，畫面看起來正常——但泰文使用者會突然讀到一句中文。
    const keys = [
      'nearby.tabNearby',
      'nearby.tabByName',
      'nearby.filterType',
      'nearby.filterDepartment',
      'nearby.openNow',
      'nearby.openNowHint',
      'nearby.keywordLabel',
      'nearby.keywordButton',
      'nearby.keywordRequired',
      'nearby.nameEmpty',
      'nearby.summary.foundWithin',
      'nearby.summary.expanded',
      'nearby.summary.partial',
      'nearby.summary.openNowFound',
      'nearby.summary.openNowNone',
      'nearby.summary.pharmacyDataGap',
      'nearby.empty.none',
      'nearby.empty.pharmacyNone',
      'nearby.empty.unknownDepartment',
      'nearby.empty.unknownFacilityType',
      'nearby.status.open',
      'nearby.status.beforeOpen',
      'nearby.status.break',
      'nearby.status.closedToday',
      'nearby.status.closedDay',
      'nearby.status.emergency',
      'nearby.status.callAhead',
      'nearby.status.unknown',
      'nearby.showHours',
      'nearby.dayClosed',
      'nearby.call',
      'nearby.navigate',
    ];

    await i18n.changeLanguage('zh-TW');
    const zhValues = new Set(keys.map((key) => i18n.t(key)));

    for (const lang of ['en', 'id', 'vi', 'th']) {
      await i18n.changeLanguage(lang);
      for (const key of keys) {
        const value = i18n.t(key);
        expect(value, `${lang} / ${key} 未翻譯`).not.toBe(key);
        expect(zhValues.has(value), `${lang} / ${key} 退回了 zh-TW`).toBe(false);
      }
    }

    // 日文與中文共用漢字，「内科」「外科」這類詞本來就同形，逐字比對會誤判成漏譯，
    // 因此只檢查 key 有被解析，不檢查是否與中文相異。
    await i18n.changeLanguage('ja');
    for (const key of keys) {
      expect(i18n.t(key), `ja / ${key} 未翻譯`).not.toBe(key);
    }
  });

  it('星期文案六語齊備——門診時間表整週都靠它', async () => {
    const days = [
      'weekday.monday',
      'weekday.tuesday',
      'weekday.wednesday',
      'weekday.thursday',
      'weekday.friday',
      'weekday.saturday',
      'weekday.sunday',
    ];

    for (const lang of ['zh-TW', 'en', 'id', 'vi', 'th', 'ja']) {
      await i18n.changeLanguage(lang);
      for (const key of days) {
        expect(i18n.t(key), `${lang} / ${key} 未翻譯`).not.toBe(key);
      }
    }
  });
});

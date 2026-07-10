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
});

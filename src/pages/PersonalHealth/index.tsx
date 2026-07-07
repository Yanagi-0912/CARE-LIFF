import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { upsertPersonalHealthProfile, getPersonalHealthProfile } from '../../api/profileApi';
import liff from '@line/liff';
import './index.css';

const LIFF_ID = (import.meta.env.VITE_LIFF_ID ?? '').trim();
interface HealthData {
    name: string;
    gender: string;
    height: string;
    weight: string;
    age: string;
    // 修改：慢性病史改為可複選
    chronicDisease: string[];
    majorIllness: string;
    surgeryHistory?: string;
}

const defaultData: HealthData = {
    name: '',
    gender: '',
    height: '',
    weight: '',
    age: '',
    // 修改：慢性病史改為可複選
    chronicDisease: [],
    majorIllness: '',
    surgeryHistory: '',
};

const chronicDiseaseOptions = [
    '高血壓',
    '糖尿病',
    '高血脂',
    '心臟病',
    '腎臟病',
    '氣喘',
    '慢性阻塞性肺病',
    '癌症',
    '其他',
];

const numericFieldLimits = {
    age: { min: 0, max: 130, label: '年齡', unit: '歲' },
    height: { min: 30, max: 300, label: '身高', unit: 'cm' },
    weight: { min: 1, max: 500, label: '體重', unit: 'kg' },
} as const;

const validateNumericField = (
    value: string,
    field: (typeof numericFieldLimits)[keyof typeof numericFieldLimits],
) => {
    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue) || parsedValue < field.min || parsedValue > field.max) {
        return `${field.label}，請輸入 ${field.min} 到 ${field.max} ${field.unit} 之間的數字`;
    }
    return '';
};

const PersonalHealthPage: React.FC = () => {
    const [form, setForm] = useState<HealthData>(defaultData);
    const [otherInput, setOtherInput] = useState('');
    const [otherSaved, setOtherSaved] = useState(false);
    // 儲存成功提示狀態
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
    // 儲存提示訊息
    const [saveMessage, setSaveMessage] = useState('');
    // 新增欄位獨立錯誤狀態
    const [fieldErrors, setFieldErrors] = useState<{ age?: string; height?: string; weight?: string }>({});
    // 用一個狀態控制目前打開的下拉，避免每個下拉都要一個 state
    const [openDropdown, setOpenDropdown] = useState<'gender' | 'chronic' | null>(null);
    // 顯示使用者名稱與頭像
    const [userName, setUserName] = useState<string>('');
    const [userAvatar, setUserAvatar] = useState<string>('');
    const [liffReady, setLiffReady] = useState(false);
    const [liffError, setLiffError] = useState('');
    const navigate = useNavigate();
    const genderDropdownRef = useRef<HTMLDivElement | null>(null);
    const chronicDropdownRef = useRef<HTMLDivElement | null>(null);

    // 點頁面其他地方時，收起目前打開的下拉
    useEffect(() => {
        const handleOutsideClick = (event: MouseEvent) => {
            const target = event.target as Node;
            const isClickInsideGender = genderDropdownRef.current?.contains(target);
            const isClickInsideChronic = chronicDropdownRef.current?.contains(target);

            if (!isClickInsideGender && !isClickInsideChronic) {
                setOpenDropdown(null);
            }
        };

        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, []);

    // 處理 LIFF 個人檔案資訊（從 .getProfile() 回傳）
    const handleLiffProfile = (profile: any) => {
        if (profile.displayName) {
            // 以資料庫名稱為優先，LIFF 名稱只當 fallback
            setUserName((prev) => prev || profile.displayName.trim());
            setForm((prev) => ({ ...prev, name: prev.name || profile.displayName }));
        }

        if (profile.pictureUrl) {
            setUserAvatar(profile.pictureUrl.trim());
        }
    };

    // 處理從資料庫載入的個人健康資料（從 getPersonalHealthProfile() 回傳）
    const handleUserProfileData = (data: any) => {
        if (!data) {
            return;
        }

        console.log('已加載使用者資料');

        setForm((prev) => ({
            ...prev,
            name: data.name || prev.name,  // 資料庫優先
            gender: data.gender || '',
            height: data.height?.toString() || '',
            weight: data.weight?.toString() || '',
            age: data.age?.toString() || '',
            chronicDisease: data.chronic_history ? data.chronic_history.split('、').filter(Boolean) : [],
            majorIllness: data.major_illness_history || '',
            surgeryHistory: data.surgery_history || '',
        }));

        if (data.name) {
            setUserName(data.name);
        }
    };

    useEffect(() => {
        const initializeUserProfile = async () => {
            // 1. 獨立的後端 API 載入流程：/me API 由 token 辨識使用者，不需要前端提供 userId
            try {
                const data = await getPersonalHealthProfile();
                handleUserProfileData(data);
            } catch (error: any) {
                console.warn('載入使用者資料失敗:', error);
                setLiffError(error instanceof Error ? error.message : '取得個人資料失敗，請稍後再試。');
            }

            // 2. 獨立的 LINE LIFF 初始化流程
            if (!LIFF_ID) {
                setLiffError((prev) => prev || '尚未設定 VITE_LIFF_ID，無法初始化 LINE LIFF。');
                console.error('尚未設定 VITE_LIFF_ID，無法初始化 LINE LIFF。');
            } else {
                liff
                    .init({ liffId: LIFF_ID })
                    .then(() => {
                        setLiffReady(true);

                        // 1. 從 LIFF 獲取 user 頭像資訊
                        liff
                            .getProfile()
                            .then(handleLiffProfile)
                            .catch((err) => {
                                console.warn('獲取 LIFF 用戶資訊失敗:', err);
                            });
                    })
                    .catch((error) => {
                        console.warn('LIFF 初始化失敗:', error);
                    });
            }
        };

        initializeUserProfile();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        // 慢性病史改為可複選，這裡只處理其他欄位
        if (name === 'chronicDiseaseOther') {
            setOtherInput(value);
            setOtherSaved(false);
        } else {
            setForm((prev) => ({ ...prev, [name]: value }));
        }
    };

    // 慢性病史改為可複選（dropdown list 勾選處理）
    const handleChronicToggle = (value: string) => {
        setForm((prev) => {
            const exists = prev.chronicDisease.includes(value);
            const next = exists
                ? prev.chronicDisease.filter((item) => item !== value)
                : [...prev.chronicDisease, value];
            return { ...prev, chronicDisease: next };
        });
        if (value === '其他' && form.chronicDisease.includes('其他')) {
            setOtherInput('');
            setOtherSaved(false);
        }
    };

    // 修改：儲存訊息 3 秒後收回
    useEffect(() => {
        if (saveStatus === 'idle') {
            return;
        }
        const timer = window.setTimeout(() => {
            setSaveStatus('idle');
            setFieldErrors({});
        }, 3000);
        return () => window.clearTimeout(timer);
    }, [saveStatus]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // 性別必填檢查，避免空值送出
        if (!form.gender) {
            setSaveMessage('請先選擇性別');
            setSaveStatus('error');
            return;
        }

        const errors: { age?: string; height?: string; weight?: string } = {
            age: validateNumericField(form.age, numericFieldLimits.age),
            height: validateNumericField(form.height, numericFieldLimits.height),
            weight: validateNumericField(form.weight, numericFieldLimits.weight),
        };

        // 過濾掉沒有錯誤的欄位（保留真正有錯誤訊息的）
        const activeErrors = Object.fromEntries(
            Object.entries(errors).filter(([_, msg]) => msg !== '')
        );

        if (Object.keys(activeErrors).length > 0) {
            setFieldErrors(activeErrors);              // 1. 將錯誤塞進對應欄位狀態
            setSaveMessage('欄位輸入有誤，請檢查下方提示'); // 2. Toast 只顯示簡單的主標題
            setSaveStatus('error');
            return; // 擋住不送出
        }

        // 驗證通過，清空先前的錯誤
        setFieldErrors({});

        // 慢性病沒有選或是選其他但不輸入都存"無"
        // 慢性病史改為可複選，整理成陣列再轉成字串
        const selected = form.chronicDisease.filter((v) => v !== '其他');
        const otherValue = otherInput.trim();
        let chronicList = selected;
        // 選擇其他但未輸入時，不自動塞 "無"
        if (form.chronicDisease.includes('其他') && otherValue) {
            chronicList = [...selected, otherValue];
        }
        if (chronicList.length === 0) {
            chronicList = ['無'];
        }

        const payload = {
            name: form.name,
            gender: form.gender,
            height: Number(form.height),
            weight: Number(form.weight),
            age: Number(form.age),
            // 修改：慢性病史改為可複選，後端目前是字串欄位
            chronic_history: chronicList.join('、'),
            // 重大傷病紀錄：如果沒填就存 "無"
            major_illness_history: form.majorIllness.trim() || '無',
            // 手術史：如果沒填或不存在，就存 "無"
            surgery_history: (form.surgeryHistory || '').trim() || '無',
            health_consultations: {} // 先放空 JSON
        };

        try {
            await upsertPersonalHealthProfile(payload);
            console.log('儲存成功');
            setSaveMessage('已成功儲存個人健康資料');
            setSaveStatus('success');
        } catch (error) {
            console.error('儲存失敗（網路或請求中斷）:', error);
            setSaveMessage(error instanceof Error ? error.message : '網路異常，請稍後再試');
            setSaveStatus('error');
        }
    };

    // 慢性病史改為可複選
    const showOtherInput = form.chronicDisease.includes('其他');

    // 判斷是否有任一欄位有輸入
    const hasInput = !!(
        form.height ||
        form.weight ||
        form.age ||
        form.chronicDisease.length || // 慢性病史改為可複選
        form.majorIllness ||
        otherInput
    );

    const isLoggedIn = liffReady && liff.isLoggedIn();

    return (
        <div className="pageContainer">
            {liffError && <div className="saveToast saveToastError">{liffError}</div>}
            <section className="profileBanner">
                <div className="profileAvatarWrap">
                    {userAvatar ? (
                        <img
                            className="profileAvatar"
                            src={userAvatar}
                            alt={userName ? `${userName} 的頭像` : '使用者頭像'}
                        />
                    ) : (
                        <div className="profileAvatar profileAvatarFallback" aria-hidden="true">
                            {userName ? userName.charAt(0) : 'U'}
                        </div>
                    )}
                </div>
                <div className="profileBannerText">
                    <div className="profileBannerLabel">{isLoggedIn ? '已登入' : '您尚未登入!'}</div>
                    <div className="formTitle profileBannerTitle">{userName ? `${userName} 的健康資料` : '個人健康資料'}</div>
                </div>
            </section>

            {/* 儲存成功/失敗提示 */}
            {saveStatus === 'success' && (
                <div className="saveToast saveToastSuccess">{saveMessage || '已成功儲存個人健康資料'}</div>
            )}
            {saveStatus === 'error' && (
                <div className="saveToast saveToastError">{saveMessage || '儲存失敗，請稍後再試'}</div>
            )}
            {/* 加上 noValidate 阻擋瀏覽器原生彈窗攔截 */}
            <form id="personalHealthForm" className="formContainer" onSubmit={handleSubmit} noValidate>
                <div className="formGroup">
                    <label className="label" htmlFor="name">姓名</label>
                    <input
                        className="input"
                        type="text"
                        id="name"
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        placeholder="請輸入姓名"
                        required
                    />
                </div>
                <div className="formGroup">
                    <label className="label" htmlFor="gender">性別</label>
                    <div ref={genderDropdownRef} className="singleSelectWrapper">
                        {/* 修改：性別單選下拉處理 */}
                        <button
                            type="button"
                            className="singleSelectButton"
                            aria-haspopup="listbox"
                            aria-expanded={openDropdown === 'gender'}
                            onClick={() => setOpenDropdown(openDropdown === 'gender' ? null : 'gender')}
                        >
                            <span className="singleSelectText">
                                {form.gender || '請選擇性別'}
                            </span>
                            <span className="singleSelectCaret" aria-hidden="true">▼</span>
                        </button>
                        {openDropdown === 'gender' && (
                            <div className="singleSelectMenu" role="listbox">
                                {['男', '女'].map((opt) => (
                                    <button
                                        key={opt}
                                        type="button"
                                        className={`singleSelectItem ${form.gender === opt ? 'isSelected' : ''}`}
                                        onClick={() => { setForm(prev => ({ ...prev, gender: opt })); setOpenDropdown(null); }}
                                    >
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="formGroup">
                    <label className="label" htmlFor="height">身高 (cm)</label>
                    <input
                        className={`input ${fieldErrors.height ? 'inputHasError' : ''}`}
                        type="number"
                        id="height"
                        name="height"
                        value={form.height}
                        onChange={handleChange}
                        placeholder="請輸入身高"
                        min="30"
                        max="300"
                        step="0.1"
                        required
                    />
                    {fieldErrors.height && <span className="fieldErrorText">{fieldErrors.height}</span>}
                </div>
                <div className="formGroup">
                    <label className="label" htmlFor="weight">體重 (kg)</label>
                    <input
                        className={`input ${fieldErrors.weight ? 'inputHasError' : ''}`}
                        type="number"
                        id="weight"
                        name="weight"
                        value={form.weight}
                        onChange={handleChange}
                        placeholder="請輸入體重"
                        min="1"
                        max="500"
                        step="0.1"
                        required
                    />
                    {fieldErrors.weight && <span className="fieldErrorText">{fieldErrors.weight}</span>}
                </div>
                <div className="formGroup">
                    <label className="label" htmlFor="age">年齡</label>
                    <input
                        className={`input ${fieldErrors.age ? 'inputHasError' : ''}`}
                        type="number"
                        id="age"
                        name="age"
                        value={form.age}
                        onChange={handleChange}
                        placeholder="請輸入年齡"
                        min="0"
                        max="130"
                        step="1"
                        required
                    />
                    {fieldErrors.age && <span className="fieldErrorText">{fieldErrors.age}</span>}
                </div>
                <div className="formGroup">
                    <label className="label">慢性病史</label>
                    {/* 慢性病史改為可複選 */}
                    <div ref={chronicDropdownRef} className="multiSelectWrapper" style={{ marginBottom: showOtherInput ? 8 : 0 }}>
                        <button
                            type="button"
                            className="multiSelectButton"
                            aria-haspopup="listbox"
                            aria-expanded={openDropdown === 'chronic'}
                            onClick={() => setOpenDropdown(openDropdown === 'chronic' ? null : 'chronic')}
                        >
                            <span className="multiSelectText">
                                {form.chronicDisease.length > 0
                                    ? form.chronicDisease.join('、')
                                    : '請選擇慢性病史'}
                            </span>
                            <span className="multiSelectCaret" aria-hidden="true">▼</span>
                        </button>
                        {openDropdown === 'chronic' && (
                            <div className="multiSelectMenu" role="listbox" aria-multiselectable="true">
                                {chronicDiseaseOptions.map(opt => {
                                    const checked = form.chronicDisease.includes(opt);
                                    return (
                                        <button
                                            key={opt}
                                            type="button"
                                            className={`multiSelectItem ${checked ? 'isSelected' : ''}`}
                                            onClick={() => handleChronicToggle(opt)}
                                        >
                                            <span className="multiSelectCheck" aria-hidden="true">
                                                {checked ? '✓' : ''}
                                            </span>
                                            <span>{opt}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    {showOtherInput && (
                        <div className="otherInputRow">
                            <input
                                className="input"
                                type="text"
                                name="chronicDiseaseOther"
                                value={otherInput}
                                onChange={handleChange}
                                placeholder="請輸入其他慢性病"
                            />
                            <button
                                type="button"
                                aria-label="儲存其他慢性病"
                                onClick={() => { setForm(prev => ({ ...prev, chronicDiseaseOther: otherInput })); setOtherSaved(true); }}
                                disabled={!otherInput.trim()}
                            >
                                <svg width="24px" height="24px" viewBox="0 0 24 24" fill="none" stroke="#4a90e2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="4 13 9 18 20 7" />
                                </svg>
                            </button>
                            {otherSaved && <span className="otherSavedBadge">已儲存</span>}
                        </div>
                    )}
                </div>
                <div className="formGroup">
                    <label className="label" htmlFor="majorIllness">重大傷病紀錄</label>
                    <textarea
                        className="input longInput"
                        id="majorIllness"
                        name="majorIllness"
                        value={form.majorIllness}
                        onChange={handleChange}
                        placeholder="請輸入重大傷病紀錄 (如無則不需填寫)"
                        rows={2}
                    />
                </div>
                <div className="formGroup">
                    <label className="label" htmlFor="surgeryHistory">開刀紀錄</label>
                    <textarea
                        className="input longInput"
                        id="surgeryHistory"
                        name="surgeryHistory"
                        value={form.surgeryHistory}
                        onChange={handleChange}
                        placeholder="請輸入開刀紀錄 (如無則不需填寫)"
                        rows={2}
                    />
                </div>
            </form>
            <div className="actionRow">
                {hasInput && (
                    <button className="button" type="submit" form="personalHealthForm">儲存紀錄</button>
                )}
                <button onClick={() => navigate('/personalhealth/consult')} className="button consultButton">
                    查看諮詢紀錄
                </button>
            </div>
        </div>
    );
};

export default PersonalHealthPage;
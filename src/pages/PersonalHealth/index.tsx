import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    upsertPersonalHealthProfile,
    getPersonalHealthProfile,
    type HealthProfile,
} from '../../api/profileApi';
import liff from '@line/liff';
import Stepper, { Step } from '../../components/Stepper/Stepper';
import './index.css';

const LIFF_ID = (import.meta.env.VITE_LIFF_ID ?? '').trim();

/** 後端儲存用性別值（保持中文，與既有資料相容） */
const GENDER_OPTIONS = [
    { value: '男', labelKey: 'personalHealth.gender.male' },
    { value: '女', labelKey: 'personalHealth.gender.female' },
] as const;

/** 後端儲存用慢性病選項值（保持中文，與既有資料相容） */
const CHRONIC_OPTIONS = [
    { value: '高血壓', labelKey: 'personalHealth.chronic.hypertension' },
    { value: '糖尿病', labelKey: 'personalHealth.chronic.diabetes' },
    { value: '高血脂', labelKey: 'personalHealth.chronic.hyperlipidemia' },
    { value: '心臟病', labelKey: 'personalHealth.chronic.heartDisease' },
    { value: '腎臟病', labelKey: 'personalHealth.chronic.kidneyDisease' },
    { value: '氣喘', labelKey: 'personalHealth.chronic.asthma' },
    { value: '慢性阻塞性肺病', labelKey: 'personalHealth.chronic.copd' },
    { value: '癌症', labelKey: 'personalHealth.chronic.cancer' },
    { value: '其他', labelKey: 'personalHealth.chronic.other' },
] as const;

const OTHER_CHRONIC_VALUE = '其他';
const NONE_VALUE = '無';

interface HealthData {
    name: string;
    gender: string;
    height: string;
    weight: string;
    age: string;
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
    chronicDisease: [],
    majorIllness: '',
    surgeryHistory: '',
};

const numericFieldMeta = {
    age: {
        min: 0,
        max: 130,
        labelKey: 'personalHealth.field.age',
        unitKey: 'personalHealth.unit.age',
    },
    height: {
        min: 30,
        max: 300,
        labelKey: 'personalHealth.field.height',
        unitKey: 'personalHealth.unit.height',
    },
    weight: {
        min: 1,
        max: 500,
        labelKey: 'personalHealth.field.weight',
        unitKey: 'personalHealth.unit.weight',
    },
} as const;

type NumericFieldName = keyof typeof numericFieldMeta;

type TranslateFn = (
    key: string,
    options?: Record<string, string | number>,
) => string;

const validateNumericField = (
    value: string,
    field: NumericFieldName,
    t: TranslateFn,
) => {
    const meta = numericFieldMeta[field];
    const label = t(meta.labelKey);
    if (!value.trim()) {
        return t('personalHealth.validation.required', { label });
    }

    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue) || parsedValue < meta.min || parsedValue > meta.max) {
        return t('personalHealth.validation.range', {
            label,
            min: meta.min,
            max: meta.max,
            unit: t(meta.unitKey),
        });
    }
    return '';
};

const PersonalHealthPage: React.FC = () => {
    const { t } = useTranslation();
    const [form, setForm] = useState<HealthData>(defaultData);
    const [currentStep, setCurrentStep] = useState(1);
    const [otherInput, setOtherInput] = useState('');
    const [otherSaved, setOtherSaved] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [saveMessage, setSaveMessage] = useState('');
    const [fieldErrors, setFieldErrors] = useState<{ age?: string; height?: string; weight?: string }>({});
    const [openDropdown, setOpenDropdown] = useState<'gender' | 'chronic' | null>(null);
    const [userName, setUserName] = useState<string>('');
    const [userAvatar, setUserAvatar] = useState<string>('');
    const [liffReady, setLiffReady] = useState(false);
    const [liffError, setLiffError] = useState('');
    const navigate = useNavigate();
    const genderDropdownRef = useRef<HTMLDivElement | null>(null);
    const chronicDropdownRef = useRef<HTMLDivElement | null>(null);

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

    const handleLiffProfile = (
        profile: Awaited<ReturnType<typeof liff.getProfile>>,
    ) => {
        if (profile.displayName) {
            setUserName((prev) => prev || profile.displayName.trim());
            setForm((prev) => ({ ...prev, name: prev.name || profile.displayName }));
        }

        if (profile.pictureUrl) {
            setUserAvatar(profile.pictureUrl.trim());
        }
    };

    const handleUserProfileData = (data: HealthProfile | null) => {
        if (!data) {
            return;
        }

        const chronicParts = data.chronic_history
            ? data.chronic_history.split('、').filter(Boolean)
            : [];
        const chronicDisease =
            chronicParts.length === 1 && chronicParts[0] === NONE_VALUE
                ? []
                : chronicParts;

        setForm((prev) => ({
            ...prev,
            name: data.name || prev.name,
            gender: data.gender || '',
            height: data.height?.toString() || '',
            weight: data.weight?.toString() || '',
            age: data.age?.toString() || '',
            chronicDisease,
            majorIllness: data.major_illness_history || '',
            surgeryHistory: data.surgery_history || '',
        }));

        if (data.name) {
            setUserName(data.name);
        }
    };

    useEffect(() => {
        const initializeUserProfile = async () => {
            try {
                const data = await getPersonalHealthProfile();
                handleUserProfileData(data);
            } catch (error: unknown) {
                console.warn('載入使用者資料失敗:', error);
                setLiffError(
                    error instanceof Error
                        ? error.message
                        : t('personalHealth.loadError'),
                );
            }

            if (!LIFF_ID) {
                setLiffError((prev) => prev || t('personalHealth.liffIdMissing'));
                console.error(t('personalHealth.liffIdMissing'));
            } else {
                liff
                    .init({ liffId: LIFF_ID })
                    .then(() => {
                        setLiffReady(true);
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

        void initializeUserProfile();
        // 僅在掛載時載入；語言切換不需重抓 API
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        if (name === 'chronicDiseaseOther') {
            setOtherInput(value);
            setOtherSaved(false);
        } else {
            setForm((prev) => ({ ...prev, [name]: value }));
        }
    };

    const handleNumericBlur = (field: NumericFieldName) => {
        setFieldErrors((prev) => ({
            ...prev,
            [field]: validateNumericField(form[field], field, t),
        }));
    };

    const handleChronicToggle = (value: string) => {
        setForm((prev) => {
            const exists = prev.chronicDisease.includes(value);
            const next = exists
                ? prev.chronicDisease.filter((item) => item !== value)
                : [...prev.chronicDisease, value];
            return { ...prev, chronicDisease: next };
        });
        if (value === OTHER_CHRONIC_VALUE && form.chronicDisease.includes(OTHER_CHRONIC_VALUE)) {
            setOtherInput('');
            setOtherSaved(false);
        }
    };

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

    const handleSave = async () => {
        if (!form.gender) {
            setSaveMessage(t('personalHealth.genderRequired'));
            setSaveStatus('error');
            throw new Error(t('personalHealth.genderRequired'));
        }

        const errors: { age?: string; height?: string; weight?: string } = {
            age: validateNumericField(form.age, 'age', t),
            height: validateNumericField(form.height, 'height', t),
            weight: validateNumericField(form.weight, 'weight', t),
        };

        const activeErrors = Object.fromEntries(
            Object.entries(errors).filter(([, message]) => message !== ''),
        ) as { age?: string; height?: string; weight?: string };

        if (Object.keys(activeErrors).length > 0) {
            setFieldErrors(activeErrors);
            setSaveMessage(t('personalHealth.fieldErrorToast'));
            setSaveStatus('error');
            throw new Error(t('personalHealth.fieldErrorToast'));
        }

        setFieldErrors({});

        const selected = form.chronicDisease.filter((v) => v !== OTHER_CHRONIC_VALUE);
        const otherValue = otherInput.trim();
        let chronicList = selected;
        if (form.chronicDisease.includes(OTHER_CHRONIC_VALUE) && otherValue) {
            chronicList = [...selected, otherValue];
        }
        if (chronicList.length === 0) {
            chronicList = [NONE_VALUE];
        }

        const payload = {
            name: form.name,
            gender: form.gender,
            height: Number(form.height),
            weight: Number(form.weight),
            age: Number(form.age),
            chronic_history: chronicList.join('、'),
            major_illness_history: form.majorIllness.trim() || NONE_VALUE,
            surgery_history: (form.surgeryHistory || '').trim() || NONE_VALUE,
            health_consultations: {},
        };

        setIsSaving(true);
        try {
            await upsertPersonalHealthProfile(payload);
            setSaveMessage(t('personalHealth.saveSuccess'));
            setSaveStatus('success');
        } catch (error) {
            console.error('儲存失敗（網路或請求中斷）:', error);
            setSaveMessage(
                error instanceof Error ? error.message : t('personalHealth.networkError'),
            );
            setSaveStatus('error');
            throw error;
        } finally {
            setIsSaving(false);
        }
    };

    const showOtherInput = form.chronicDisease.includes(OTHER_CHRONIC_VALUE);
    const ageError = validateNumericField(form.age, 'age', t);
    const heightError = validateNumericField(form.height, 'height', t);
    const weightError = validateNumericField(form.weight, 'weight', t);
    const isBasicStepComplete = Boolean(
        form.name.trim() && form.gender && !ageError,
    );
    const isBodyStepComplete = !heightError && !weightError;
    const canContinue =
        currentStep === 1
            ? isBasicStepComplete
            : currentStep === 2
                ? isBodyStepComplete
                : true;

    const isLoggedIn = liffReady && liff.isLoggedIn();

    const genderLabel = form.gender
        ? t(
            GENDER_OPTIONS.find((option) => option.value === form.gender)?.labelKey
                ?? 'personalHealth.genderPlaceholder',
        )
        : t('personalHealth.genderPlaceholder');

    const chronicLabelMap = Object.fromEntries(
        CHRONIC_OPTIONS.map((option) => [option.value, t(option.labelKey)]),
    ) as Record<string, string>;

    const formatChronicSelection = (values: string[]) =>
        values.map((value) => chronicLabelMap[value] ?? value).join('、');

    return (
        <div className="pageContainer">
            {liffError && <div className="saveToast saveToastError">{liffError}</div>}
            <section className="profileBanner">
                <div className="profileAvatarWrap">
                    {userAvatar ? (
                        <img
                            className="profileAvatar"
                            src={userAvatar}
                            alt={
                                userName
                                    ? t('personalHealth.avatarAlt', { name: userName })
                                    : t('personalHealth.avatarAltFallback')
                            }
                        />
                    ) : (
                        <div className="profileAvatar profileAvatarFallback" aria-hidden="true">
                            {userName ? userName.charAt(0) : 'U'}
                        </div>
                    )}
                </div>
                <div className="profileBannerText">
                    <div className="profileBannerLabel">
                        {isLoggedIn
                            ? t('personalHealth.loggedIn')
                            : t('personalHealth.loggedOut')}
                    </div>
                    <div className="formTitle profileBannerTitle">
                        {userName
                            ? t('personalHealth.titleWithName', { name: userName })
                            : t('personalHealth.title')}
                    </div>
                </div>
            </section>

            {saveStatus === 'success' && (
                <div className="saveToast saveToastSuccess">
                    {saveMessage || t('personalHealth.saveSuccess')}
                </div>
            )}
            {saveStatus === 'error' && (
                <div className="saveToast saveToastError">
                    {saveMessage || t('personalHealth.saveError')}
                </div>
            )}
            <form
                id="personalHealthForm"
                className="formContainer stepperForm"
                onSubmit={(event) => event.preventDefault()}
                noValidate
            >
                <Stepper
                    initialStep={1}
                    onStepChange={(step) => {
                        setCurrentStep(step);
                        setOpenDropdown(null);
                    }}
                    onFinalStepCompleted={handleSave}
                    backButtonText={t('personalHealth.back')}
                    nextButtonText={t('personalHealth.next')}
                    completeButtonText={
                        isSaving ? t('personalHealth.saving') : t('personalHealth.save')
                    }
                    nextButtonProps={{ disabled: !canContinue || isSaving }}
                    disableStepIndicators
                    aria-label={t('personalHealth.stepperAriaLabel')}
                >
                    <Step>
                        <div className="healthStepIntro">
                            <span>{t('personalHealth.step1.label')}</span>
                            <h2>{t('personalHealth.step1.title')}</h2>
                            <p>{t('personalHealth.step1.desc')}</p>
                        </div>

                        <div className="formGroup">
                            <label className="label" htmlFor="name">
                                {t('personalHealth.name')}
                            </label>
                            <input
                                className="input"
                                type="text"
                                id="name"
                                name="name"
                                value={form.name}
                                onChange={handleChange}
                                placeholder={t('personalHealth.namePlaceholder')}
                                required
                            />
                        </div>

                        <div className="formGroup">
                            <label className="label" htmlFor="gender">
                                {t('personalHealth.gender')}
                            </label>
                            <div ref={genderDropdownRef} className="singleSelectWrapper">
                                <button
                                    id="gender"
                                    type="button"
                                    className="singleSelectButton"
                                    aria-label={t('personalHealth.genderAria', {
                                        value: genderLabel,
                                    })}
                                    aria-haspopup="listbox"
                                    aria-expanded={openDropdown === 'gender'}
                                    onClick={() =>
                                        setOpenDropdown(openDropdown === 'gender' ? null : 'gender')
                                    }
                                >
                                    <span className="singleSelectText">{genderLabel}</span>
                                    <span className="singleSelectCaret" aria-hidden="true">▼</span>
                                </button>
                                {openDropdown === 'gender' && (
                                    <div className="singleSelectMenu" role="listbox">
                                        {GENDER_OPTIONS.map((option) => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                className={`singleSelectItem ${
                                                    form.gender === option.value ? 'isSelected' : ''
                                                }`}
                                                onClick={() => {
                                                    setForm((prev) => ({
                                                        ...prev,
                                                        gender: option.value,
                                                    }));
                                                    setOpenDropdown(null);
                                                }}
                                            >
                                                {t(option.labelKey)}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="formGroup">
                            <label className="label" htmlFor="age">
                                {t('personalHealth.age')}
                            </label>
                            <div className="fieldControl">
                                <input
                                    className={`input ${fieldErrors.age ? 'inputHasError' : ''}`}
                                    type="number"
                                    id="age"
                                    name="age"
                                    value={form.age}
                                    onChange={handleChange}
                                    onBlur={() => handleNumericBlur('age')}
                                    placeholder={t('personalHealth.agePlaceholder')}
                                    min="0"
                                    max="130"
                                    step="1"
                                    required
                                />
                                {fieldErrors.age && (
                                    <span className="fieldErrorText">{fieldErrors.age}</span>
                                )}
                            </div>
                        </div>

                        {!isBasicStepComplete && (
                            <p className="stepRequirement">{t('personalHealth.basicRequired')}</p>
                        )}
                    </Step>

                    <Step>
                        <div className="healthStepIntro">
                            <span>{t('personalHealth.step2.label')}</span>
                            <h2>{t('personalHealth.step2.title')}</h2>
                            <p>{t('personalHealth.step2.desc')}</p>
                        </div>

                        <div className="formGroup">
                            <label className="label" htmlFor="height">
                                {t('personalHealth.height')}
                            </label>
                            <div className="fieldControl">
                                <input
                                    className={`input ${fieldErrors.height ? 'inputHasError' : ''}`}
                                    type="number"
                                    id="height"
                                    name="height"
                                    value={form.height}
                                    onChange={handleChange}
                                    onBlur={() => handleNumericBlur('height')}
                                    placeholder={t('personalHealth.heightPlaceholder')}
                                    min="30"
                                    max="300"
                                    step="0.1"
                                    required
                                />
                                {fieldErrors.height && (
                                    <span className="fieldErrorText">{fieldErrors.height}</span>
                                )}
                            </div>
                        </div>

                        <div className="formGroup">
                            <label className="label" htmlFor="weight">
                                {t('personalHealth.weight')}
                            </label>
                            <div className="fieldControl">
                                <input
                                    className={`input ${fieldErrors.weight ? 'inputHasError' : ''}`}
                                    type="number"
                                    id="weight"
                                    name="weight"
                                    value={form.weight}
                                    onChange={handleChange}
                                    onBlur={() => handleNumericBlur('weight')}
                                    placeholder={t('personalHealth.weightPlaceholder')}
                                    min="1"
                                    max="500"
                                    step="0.1"
                                    required
                                />
                                {fieldErrors.weight && (
                                    <span className="fieldErrorText">{fieldErrors.weight}</span>
                                )}
                            </div>
                        </div>

                        {!isBodyStepComplete && (
                            <p className="stepRequirement">{t('personalHealth.bodyRequired')}</p>
                        )}
                    </Step>

                    <Step>
                        <div className="healthStepIntro">
                            <span>{t('personalHealth.step3.label')}</span>
                            <h2>{t('personalHealth.step3.title')}</h2>
                            <p>{t('personalHealth.step3.desc')}</p>
                        </div>

                        <div className="formGroup">
                            <label className="label">{t('personalHealth.chronic')}</label>
                            <div className="historyControl">
                                <div
                                    ref={chronicDropdownRef}
                                    className="multiSelectWrapper"
                                >
                                    <button
                                        type="button"
                                        className="multiSelectButton"
                                        aria-haspopup="listbox"
                                        aria-expanded={openDropdown === 'chronic'}
                                        onClick={() =>
                                            setOpenDropdown(
                                                openDropdown === 'chronic' ? null : 'chronic',
                                            )
                                        }
                                    >
                                        <span className="multiSelectText">
                                            {form.chronicDisease.length > 0
                                                ? formatChronicSelection(form.chronicDisease)
                                                : t('personalHealth.chronicPlaceholder')}
                                        </span>
                                        <span className="multiSelectCaret" aria-hidden="true">▼</span>
                                    </button>
                                    {openDropdown === 'chronic' && (
                                        <div
                                            className="multiSelectMenu"
                                            role="listbox"
                                            aria-multiselectable="true"
                                        >
                                            {CHRONIC_OPTIONS.map((option) => {
                                                const checked = form.chronicDisease.includes(
                                                    option.value,
                                                );
                                                return (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        className={`multiSelectItem ${
                                                            checked ? 'isSelected' : ''
                                                        }`}
                                                        onClick={() =>
                                                            handleChronicToggle(option.value)
                                                        }
                                                    >
                                                        <span
                                                            className="multiSelectCheck"
                                                            aria-hidden="true"
                                                        >
                                                            {checked ? '✓' : ''}
                                                        </span>
                                                        <span>{t(option.labelKey)}</span>
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
                                            placeholder={t(
                                                'personalHealth.chronicOtherPlaceholder',
                                            )}
                                        />
                                        <button
                                            type="button"
                                            aria-label={t(
                                                'personalHealth.chronicOtherSaveAria',
                                            )}
                                            onClick={() => {
                                                setOtherSaved(true);
                                            }}
                                            disabled={!otherInput.trim()}
                                        >
                                            <svg
                                                width="24"
                                                height="24"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            >
                                                <polyline points="4 13 9 18 20 7" />
                                            </svg>
                                        </button>
                                        {otherSaved && (
                                            <span className="otherSavedBadge">
                                                {t('personalHealth.chronicOtherSaved')}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="formGroup">
                            <label className="label" htmlFor="majorIllness">
                                {t('personalHealth.majorIllness')}
                            </label>
                            <textarea
                                className="input longInput"
                                id="majorIllness"
                                name="majorIllness"
                                value={form.majorIllness}
                                onChange={handleChange}
                                placeholder={t('personalHealth.majorIllnessPlaceholder')}
                                rows={2}
                            />
                        </div>

                        <div className="formGroup">
                            <label className="label" htmlFor="surgeryHistory">
                                {t('personalHealth.surgeryHistory')}
                            </label>
                            <textarea
                                className="input longInput"
                                id="surgeryHistory"
                                name="surgeryHistory"
                                value={form.surgeryHistory}
                                onChange={handleChange}
                                placeholder={t('personalHealth.surgeryHistoryPlaceholder')}
                                rows={2}
                            />
                        </div>
                    </Step>
                </Stepper>
            </form>
            <div className="actionRow">
                <button
                    onClick={() => navigate('/personalhealth/consult')}
                    className="button consultButton"
                >
                    {t('personalHealth.viewConsult')}
                </button>
            </div>
        </div>
    );
};

export default PersonalHealthPage;

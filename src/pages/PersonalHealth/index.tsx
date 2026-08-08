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
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import * as S from './styles';

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
    // 存檔結果改用 Sonner 呈現；此處只留欄位錯誤（下方 effect 負責逾時清除）
    const [fieldErrors, setFieldErrors] = useState<{ age?: string; height?: string; weight?: string }>({});
    const [openDropdown, setOpenDropdown] = useState<'gender' | 'chronic' | null>(null);
    const [userName, setUserName] = useState<string>('');
    const [userAvatar, setUserAvatar] = useState<string>('');
    const [liffReady, setLiffReady] = useState(false);
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
            let profileFailed = false;
            try {
                const data = await getPersonalHealthProfile();
                handleUserProfileData(data);
            } catch (error: unknown) {
                console.warn('載入使用者資料失敗:', error);
                profileFailed = true;
                toast.error(
                    error instanceof Error
                        ? error.message
                        : t('personalHealth.loadError'),
                );
            }

            if (!LIFF_ID) {
                // 前面已提示過就不再疊一則（原 setLiffError(prev => prev || ...) 的語意）
                if (!profileFailed) {
                    toast.error(t('personalHealth.liffIdMissing'));
                }
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

    // 欄位錯誤 3 秒後自動清除（原本綁在 saveStatus 上，改由 fieldErrors 自身驅動）
    useEffect(() => {
        if (Object.keys(fieldErrors).length === 0) {
            return;
        }
        const timer = window.setTimeout(() => setFieldErrors({}), 3000);
        return () => window.clearTimeout(timer);
    }, [fieldErrors]);

    const handleSave = async () => {
        if (!form.gender) {
            toast.error(t('personalHealth.genderRequired'));
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
            toast.error(t('personalHealth.fieldErrorToast'));
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
            toast.success(t('personalHealth.saveSuccess'));
        } catch (error) {
            console.error('儲存失敗（網路或請求中斷）:', error);
            toast.error(
                error instanceof Error ? error.message : t('personalHealth.networkError'),
            );
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
        <div className={S.PAGE}>
            <section className={S.BANNER}>
                <div className={S.AVATAR_WRAP}>
                    {userAvatar ? (
                        <img
                            className={S.AVATAR}
                            src={userAvatar}
                            alt={
                                userName
                                    ? t('personalHealth.avatarAlt', { name: userName })
                                    : t('personalHealth.avatarAltFallback')
                            }
                        />
                    ) : (
                        <div className={cn(S.AVATAR, S.AVATAR_FALLBACK)} aria-hidden="true">
                            {userName ? userName.charAt(0) : 'U'}
                        </div>
                    )}
                </div>
                <div className={S.BANNER_TEXT}>
                    <div className={S.BANNER_LABEL}>
                        {isLoggedIn
                            ? t('personalHealth.loggedIn')
                            : t('personalHealth.loggedOut')}
                    </div>
                    <div className={S.BANNER_TITLE}>
                        {userName
                            ? t('personalHealth.titleWithName', { name: userName })
                            : t('personalHealth.title')}
                    </div>
                </div>
            </section>

            <form
                id="personalHealthForm"
                className={cn(S.FORM_CARD, S.FORM_CARD_BARE)}
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
                        <div className={S.STEP_INTRO}>
                            <span>{t('personalHealth.step1.label')}</span>
                            <h2>{t('personalHealth.step1.title')}</h2>
                            <p>{t('personalHealth.step1.desc')}</p>
                        </div>

                        <div className={S.FORM_GROUP}>
                            <label className={S.LABEL} htmlFor="name">
                                {t('personalHealth.name')}
                            </label>
                            <input
                                className={S.INPUT}
                                type="text"
                                id="name"
                                name="name"
                                value={form.name}
                                onChange={handleChange}
                                placeholder={t('personalHealth.namePlaceholder')}
                                required
                            />
                        </div>

                        <div className={S.FORM_GROUP}>
                            <label className={S.LABEL} htmlFor="gender">
                                {t('personalHealth.gender')}
                            </label>
                            <div ref={genderDropdownRef} className={S.SELECT_WRAP}>
                                <button
                                    id="gender"
                                    type="button"
                                    className={S.SELECT_BTN}
                                    aria-label={t('personalHealth.genderAria', {
                                        value: genderLabel,
                                    })}
                                    aria-haspopup="listbox"
                                    aria-expanded={openDropdown === 'gender'}
                                    onClick={() =>
                                        setOpenDropdown(openDropdown === 'gender' ? null : 'gender')
                                    }
                                >
                                    <span className={S.SELECT_TEXT}>{genderLabel}</span>
                                    <span className={S.SELECT_CARET} aria-hidden="true">▼</span>
                                </button>
                                {openDropdown === 'gender' && (
                                    <div className={S.SELECT_MENU} role="listbox">
                                        {GENDER_OPTIONS.map((option) => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                className={cn(S.SELECT_ITEM, form.gender === option.value && S.SELECT_ITEM_ACTIVE)}
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

                        <div className={S.FORM_GROUP}>
                            <label className={S.LABEL} htmlFor="age">
                                {t('personalHealth.age')}
                            </label>
                            <div className={S.FIELD_CONTROL}>
                                <input
                                    className={cn(S.INPUT, fieldErrors.age && S.INPUT_ERROR)}
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
                                    <span className={S.FIELD_ERROR_TEXT}>{fieldErrors.age}</span>
                                )}
                            </div>
                        </div>

                        {!isBasicStepComplete && (
                            <p className={S.STEP_REQUIREMENT}>{t('personalHealth.basicRequired')}</p>
                        )}
                    </Step>

                    <Step>
                        <div className={S.STEP_INTRO}>
                            <span>{t('personalHealth.step2.label')}</span>
                            <h2>{t('personalHealth.step2.title')}</h2>
                            <p>{t('personalHealth.step2.desc')}</p>
                        </div>

                        <div className={S.FORM_GROUP}>
                            <label className={S.LABEL} htmlFor="height">
                                {t('personalHealth.height')}
                            </label>
                            <div className={S.FIELD_CONTROL}>
                                <input
                                    className={cn(S.INPUT, fieldErrors.height && S.INPUT_ERROR)}
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
                                    <span className={S.FIELD_ERROR_TEXT}>{fieldErrors.height}</span>
                                )}
                            </div>
                        </div>

                        <div className={S.FORM_GROUP}>
                            <label className={S.LABEL} htmlFor="weight">
                                {t('personalHealth.weight')}
                            </label>
                            <div className={S.FIELD_CONTROL}>
                                <input
                                    className={cn(S.INPUT, fieldErrors.weight && S.INPUT_ERROR)}
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
                                    <span className={S.FIELD_ERROR_TEXT}>{fieldErrors.weight}</span>
                                )}
                            </div>
                        </div>

                        {!isBodyStepComplete && (
                            <p className={S.STEP_REQUIREMENT}>{t('personalHealth.bodyRequired')}</p>
                        )}
                    </Step>

                    <Step>
                        <div className={S.STEP_INTRO}>
                            <span>{t('personalHealth.step3.label')}</span>
                            <h2>{t('personalHealth.step3.title')}</h2>
                            <p>{t('personalHealth.step3.desc')}</p>
                        </div>

                        <div className={S.FORM_GROUP}>
                            <label className={S.LABEL}>{t('personalHealth.chronic')}</label>
                            <div className={S.HISTORY_CONTROL}>
                                <div
                                    ref={chronicDropdownRef}
                                    className={S.MULTI_WRAP}
                                >
                                    <button
                                        type="button"
                                        className={S.SELECT_BTN}
                                        aria-haspopup="listbox"
                                        aria-expanded={openDropdown === 'chronic'}
                                        onClick={() =>
                                            setOpenDropdown(
                                                openDropdown === 'chronic' ? null : 'chronic',
                                            )
                                        }
                                    >
                                        <span className={S.SELECT_TEXT}>
                                            {form.chronicDisease.length > 0
                                                ? formatChronicSelection(form.chronicDisease)
                                                : t('personalHealth.chronicPlaceholder')}
                                        </span>
                                        <span className={S.SELECT_CARET} aria-hidden="true">▼</span>
                                    </button>
                                    {openDropdown === 'chronic' && (
                                        <div
                                            className={S.MULTI_MENU}
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
                                                        className={cn(S.MULTI_ITEM, checked && S.MULTI_ITEM_ACTIVE)}
                                                        onClick={() =>
                                                            handleChronicToggle(option.value)
                                                        }
                                                    >
                                                        <span
                                                            className={S.MULTI_CHECK}
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
                                    <div className={S.OTHER_ROW}>
                                        <input
                                            className={S.INPUT}
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
                                            <span className={S.OTHER_BADGE}>
                                                {t('personalHealth.chronicOtherSaved')}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className={S.FORM_GROUP}>
                            <label className={S.LABEL} htmlFor="majorIllness">
                                {t('personalHealth.majorIllness')}
                            </label>
                            <textarea
                                className={cn(S.INPUT, S.INPUT_LONG)}
                                id="majorIllness"
                                name="majorIllness"
                                value={form.majorIllness}
                                onChange={handleChange}
                                placeholder={t('personalHealth.majorIllnessPlaceholder')}
                                rows={2}
                            />
                        </div>

                        <div className={S.FORM_GROUP}>
                            <label className={S.LABEL} htmlFor="surgeryHistory">
                                {t('personalHealth.surgeryHistory')}
                            </label>
                            <textarea
                                className={cn(S.INPUT, S.INPUT_LONG)}
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
            <div className={S.ACTION_ROW}>
                <button
                    onClick={() => navigate('/personalhealth/consult')}
                    className={S.BUTTON}
                >
                    {t('personalHealth.viewConsult')}
                </button>
            </div>
        </div>
    );
};

export default PersonalHealthPage;

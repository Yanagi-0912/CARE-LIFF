import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    upsertPersonalHealthProfile,
    getPersonalHealthProfile,
    type HealthProfile,
} from '../../api/profileApi';
import liff from '@line/liff';
import { CheckIcon } from 'lucide-react';
import Stepper, { Step } from '../../components/Stepper/Stepper';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldContent,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
    FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Button } from '@/components/ui/button';
import { HealthField, HealthInput, HealthTextarea } from './HealthFields';

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
    surgeryHistory: string;
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

/** 三個步驟的開場文案結構相同，抽成小元件避免重複三次 */
function StepIntro({ step }: { step: 1 | 2 | 3 }) {
    const { t } = useTranslation();
    return (
        <div className="mb-6 border-b pb-4">
            <span className="text-xs font-semibold tracking-wide text-primary uppercase">
                {t(`personalHealth.step${step}.label`)}
            </span>
            <h2 className="mt-1 text-xl font-extrabold">{t(`personalHealth.step${step}.title`)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t(`personalHealth.step${step}.desc`)}</p>
        </div>
    );
}

const PersonalHealthPage: React.FC = () => {
    const { t } = useTranslation();
    const [currentStep, setCurrentStep] = useState(1);
    // 「其他」的補充輸入與已儲存徽章屬於子輸入的 UI 狀態，不是受驗證的表單值
    const [otherInput, setOtherInput] = useState('');
    const [otherSaved, setOtherSaved] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // 數值欄位的驗證沿用既有的 validateNumericField，包成 zod 的 superRefine，
    // 訊息與規則完全不變（避免重寫時漂移）。
    const schema = useMemo(() => {
        const numeric = (field: NumericFieldName) =>
            z.string().superRefine((value, ctx) => {
                const message = validateNumericField(value, field, t);
                if (message) ctx.addIssue({ code: 'custom', message });
            });
        return z.object({
            name: z.string().trim().min(1),
            gender: z.string().min(1, t('personalHealth.genderRequired')),
            age: numeric('age'),
            height: numeric('height'),
            weight: numeric('weight'),
            chronicDisease: z.array(z.string()),
            majorIllness: z.string(),
            surgeryHistory: z.string(),
        });
    }, [t]);

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        reset,
        getValues,
        formState: { errors },
    } = useForm<HealthData>({
        resolver: zodResolver(schema),
        defaultValues: defaultData,
        // blur 時驗證（取代原本的 handleNumericBlur），改動後即時重驗以清除已修正的錯誤。
        // 原本有個「3 秒後自動清掉欄位錯誤」的 effect——那是從 toast 自動消失沿用來的，
        // 對驗證錯誤並不合理（錯誤應在修正後才消失），改由 reValidateMode 處理。
        mode: 'onBlur',
        reValidateMode: 'onChange',
    });

    const form = watch();
    const [userName, setUserName] = useState<string>('');
    const [userAvatar, setUserAvatar] = useState<string>('');
    const [liffReady, setLiffReady] = useState(false);
    const navigate = useNavigate();

    const handleLiffProfile = (
        profile: Awaited<ReturnType<typeof liff.getProfile>>,
    ) => {
        if (profile.displayName) {
            setUserName((prev) => prev || profile.displayName.trim());
            if (!getValues('name')) setValue('name', profile.displayName);
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

        // reset 而非逐欄 setValue：一次帶入伺服器資料並重設 dirty/error 狀態
        reset({
            ...getValues(),
            name: data.name || getValues('name'),
            gender: data.gender || '',
            height: data.height?.toString() || '',
            weight: data.weight?.toString() || '',
            age: data.age?.toString() || '',
            chronicDisease,
            majorIllness: data.major_illness_history || '',
            surgeryHistory: data.surgery_history || '',
        });

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

    // 其餘欄位皆由 register 綁定；此處只留「其他」補充輸入
    const handleOtherChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setOtherInput(e.target.value);
        setOtherSaved(false);
    };

    const handleChronicToggle = (value: string) => {
        const current = getValues('chronicDisease');
        const exists = current.includes(value);
        setValue(
            'chronicDisease',
            exists ? current.filter((item) => item !== value) : [...current, value],
            { shouldValidate: true },
        );
        // 取消勾選「其他」時一併清掉補充輸入
        if (value === OTHER_CHRONIC_VALUE && exists) {
            setOtherInput('');
            setOtherSaved(false);
        }
    };

    // 驗證交給 resolver；handleSubmit 的失敗分支負責提示。
    // Stepper 的 onFinalStepCompleted 需要「失敗時拋錯」才不會前進，故保留 reject。
    const handleSave = () =>
        new Promise<void>((resolve, reject) => {
            void handleSubmit(
                async (values) => {
                    try {
                        await submitProfile(values);
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                },
                (validationErrors) => {
                    toast.error(
                        validationErrors.gender
                            ? t('personalHealth.genderRequired')
                            : t('personalHealth.fieldErrorToast'),
                    );
                    reject(new Error(t('personalHealth.fieldErrorToast')));
                },
            )();
        });

    const submitProfile = async (form: HealthData) => {
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
            surgery_history: form.surgeryHistory.trim() || NONE_VALUE,
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
        <div className="mx-auto flex min-h-screen max-w-[800px] flex-col px-4 py-8 max-[600px]:px-3 max-[600px]:py-6">
            <Item variant="muted" className="mb-4 rounded-2xl">
                <ItemMedia>
                    <Avatar className="size-16">
                        <AvatarImage
                            src={userAvatar || undefined}
                            alt={
                                userName
                                    ? t('personalHealth.avatarAlt', { name: userName })
                                    : t('personalHealth.avatarAltFallback')
                            }
                        />
                        <AvatarFallback className="text-xl font-extrabold">
                            {userName ? userName.charAt(0) : 'U'}
                        </AvatarFallback>
                    </Avatar>
                </ItemMedia>
                <ItemContent>
                    <ItemTitle className="text-xl font-extrabold break-words">
                        {userName
                            ? t('personalHealth.titleWithName', { name: userName })
                            : t('personalHealth.title')}
                    </ItemTitle>
                </ItemContent>
                <ItemActions>
                    <Badge variant={isLoggedIn ? 'default' : 'outline'}>
                        {isLoggedIn
                            ? t('personalHealth.loggedIn')
                            : t('personalHealth.loggedOut')}
                    </Badge>
                </ItemActions>
            </Item>

            <form
                id="personalHealthForm"
                className="flex w-full flex-col"
                onSubmit={(event) => event.preventDefault()}
                noValidate
            >
                <Stepper
                    initialStep={1}
                    onStepChange={setCurrentStep}
                    onFinalStepCompleted={handleSave}
                    backButtonText={t('personalHealth.back')}
                    nextButtonText={t('personalHealth.next')}
                    completeButtonText={
                        isSaving ? t('personalHealth.saving') : t('personalHealth.save')
                    }
                    nextButtonProps={{ disabled: !canContinue || isSaving }}
                    stepLabel={(current, total) =>
                        t('personalHealth.stepProgress', { current, total })
                    }
                    aria-label={t('personalHealth.stepperAriaLabel')}
                >
                    <Step>
                        <StepIntro step={1} />

                        <FieldGroup>
                            <HealthField htmlFor="name" label={t('personalHealth.name')}>
                                <HealthInput
                                    id="name"
                                    placeholder={t('personalHealth.namePlaceholder')}
                                    register={register('name')}
                                />
                            </HealthField>

                            <HealthField htmlFor="gender" label={t('personalHealth.gender')} error={errors.gender}>
                                {/* 儲存值是中文（'男'/'女'，與既有資料相容），
                                    故 SelectValue 需以函式 child 對應回翻譯標籤，
                                    否則英文介面會顯示「男」而不是 Male。 */}
                                <Select
                                    value={form.gender}
                                    onValueChange={(value) =>
                                        setValue('gender', value ?? '', { shouldValidate: true })
                                    }
                                >
                                    <SelectTrigger
                                        id="gender"
                                        className="w-full"
                                        aria-label={t('personalHealth.genderAria', { value: genderLabel })}
                                    >
                                        <SelectValue placeholder={t('personalHealth.genderPlaceholder')}>
                                            {(value) => {
                                                const option = GENDER_OPTIONS.find((o) => o.value === value);
                                                return option ? t(option.labelKey) : t('personalHealth.genderPlaceholder');
                                            }}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {GENDER_OPTIONS.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {t(option.labelKey)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </HealthField>

                            <HealthField
                                htmlFor="age"
                                label={t('personalHealth.age')}
                                hint={t('personalHealth.rangeHint', { min: 0, max: 130, unit: t('personalHealth.unit.age') })}
                                error={errors.age}
                            >
                                <HealthInput
                                    id="age"
                                    type="number"
                                    min="0"
                                    max="130"
                                    step="1"
                                    placeholder={t('personalHealth.agePlaceholder')}
                                    invalid={Boolean(errors.age)}
                                    register={register('age')}
                                />
                            </HealthField>
                        </FieldGroup>

                        {!isBasicStepComplete && (
                            <Alert className="mt-6">
                                <AlertDescription>{t('personalHealth.basicRequired')}</AlertDescription>
                            </Alert>
                        )}
                    </Step>

                    <Step>
                        <StepIntro step={2} />

                        <FieldGroup>
                            <HealthField
                                htmlFor="height"
                                label={t('personalHealth.height')}
                                hint={t('personalHealth.rangeHint', { min: 30, max: 300, unit: t('personalHealth.unit.height') })}
                                error={errors.height}
                            >
                                <HealthInput
                                    id="height"
                                    type="number"
                                    min="30"
                                    max="300"
                                    step="0.1"
                                    placeholder={t('personalHealth.heightPlaceholder')}
                                    invalid={Boolean(errors.height)}
                                    register={register('height')}
                                />
                            </HealthField>

                            <HealthField
                                htmlFor="weight"
                                label={t('personalHealth.weight')}
                                hint={t('personalHealth.rangeHint', { min: 1, max: 500, unit: t('personalHealth.unit.weight') })}
                                error={errors.weight}
                            >
                                <HealthInput
                                    id="weight"
                                    type="number"
                                    min="1"
                                    max="500"
                                    step="0.1"
                                    placeholder={t('personalHealth.weightPlaceholder')}
                                    invalid={Boolean(errors.weight)}
                                    register={register('weight')}
                                />
                            </HealthField>
                        </FieldGroup>

                        {!isBodyStepComplete && (
                            <Alert className="mt-6">
                                <AlertDescription>{t('personalHealth.bodyRequired')}</AlertDescription>
                            </Alert>
                        )}
                    </Step>

                    <Step>
                        <StepIntro step={3} />

                        <FieldGroup>
                            {/* 慢性病是多選。原本藏在 Popover 的下拉選單裡，長輩得先點開
                                才知道有哪些選項、選完還看不到自己選了什麼；九個選項直接攤成
                                可勾選的卡片，一次看完也少一次點擊。
                                卡片外觀用 Field 的 has-data-checked: 變體，不用自己維護選中樣式。 */}
                            <FieldSet>
                                <FieldLegend variant="label" className="text-base font-bold">
                                    {t('personalHealth.chronic')}
                                </FieldLegend>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {CHRONIC_OPTIONS.map((option) => {
                                        const id = `chronic-${option.value}`;
                                        return (
                                            // FieldLabel 包住 Field 就是官方的可點選取卡片：
                                            // 圓角、外框、勾選高亮都由元件提供，整張卡片可點
                                            <FieldLabel key={option.value} htmlFor={id}>
                                                <Field orientation="horizontal">
                                                    <Checkbox
                                                        id={id}
                                                        checked={form.chronicDisease.includes(option.value)}
                                                        onCheckedChange={() => handleChronicToggle(option.value)}
                                                    />
                                                    <FieldTitle className="text-base font-normal">
                                                        {t(option.labelKey)}
                                                    </FieldTitle>
                                                </Field>
                                            </FieldLabel>
                                        );
                                    })}
                                </div>

                                {showOtherInput && (
                                    <Field orientation="horizontal">
                                        <FieldContent>
                                            <Input
                                                name="chronicDiseaseOther"
                                                value={otherInput}
                                                onChange={handleOtherChange}
                                                placeholder={t('personalHealth.chronicOtherPlaceholder')}
                                            />
                                        </FieldContent>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            aria-label={t('personalHealth.chronicOtherSaveAria')}
                                            onClick={() => setOtherSaved(true)}
                                            disabled={!otherInput.trim()}
                                        >
                                            <CheckIcon />
                                        </Button>
                                        {otherSaved && (
                                            <Badge variant="secondary">
                                                {t('personalHealth.chronicOtherSaved')}
                                            </Badge>
                                        )}
                                    </Field>
                                )}

                                {form.chronicDisease.length > 0 && (
                                    <p className="text-sm text-muted-foreground">
                                        {formatChronicSelection(form.chronicDisease)}
                                    </p>
                                )}
                            </FieldSet>

                            <HealthField htmlFor="majorIllness" label={t('personalHealth.majorIllness')}>
                                <HealthTextarea
                                    id="majorIllness"
                                    placeholder={t('personalHealth.majorIllnessPlaceholder')}
                                    register={register('majorIllness')}
                                />
                            </HealthField>

                            <HealthField htmlFor="surgeryHistory" label={t('personalHealth.surgeryHistory')}>
                                <HealthTextarea
                                    id="surgeryHistory"
                                    placeholder={t('personalHealth.surgeryHistoryPlaceholder')}
                                    register={register('surgeryHistory')}
                                />
                            </HealthField>
                        </FieldGroup>
                    </Step>
                </Stepper>
            </form>
            <div className="mt-8 flex justify-center">
                <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="w-full max-w-[300px] rounded-full"
                    onClick={() => navigate('/personalhealth/consult')}
                >
                    {t('personalHealth.viewConsult')}
                </Button>
            </div>
        </div>
    );
};

export default PersonalHealthPage;

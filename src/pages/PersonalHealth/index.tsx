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
import { useLiff } from '../../hooks/useLiff';
import Stepper, { Step } from './Stepper';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { FieldGroup } from '@/components/ui/field';
import { Item, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Button } from '@/components/ui/button';
import { HealthField, HealthInput, HealthTextarea } from './HealthFields';
import { ChronicDiseaseField } from './ChronicDiseaseField';
import {
    GENDER_OPTIONS,
    addCustomChronic,
    defaultData,
    validateNumericField,
    type HealthData,
    type NumericFieldName,
} from './healthForm';

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
    // 自訂病名的輸入框內容。已新增的病名放在表單的 customChronic 陣列裡，
    // 這裡只是還沒按下「新增」的那一行字。
    const [customDraft, setCustomDraft] = useState('');
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
            customChronic: z.array(z.string()),
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
        mode: 'onBlur',
        reValidateMode: 'onChange',
    });

    const form = watch();
    const [userName, setUserName] = useState<string>('');
    const [userAvatar, setUserAvatar] = useState<string>('');
    const { liffReady, liffError } = useLiff();
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

        // reset 而非逐欄 setValue：一次帶入伺服器資料並重設 dirty/error 狀態
        reset({
            ...getValues(),
            name: data.name || getValues('name'),
            // 建立帳號時後端會填 'unknown'，那不是可選項目，當成還沒選，
            // 否則「下一步」會在性別看起來空白的情況下就解鎖
            gender: data.gender === 'unknown' ? '' : data.gender || '',
            height: data.height?.toString() || '',
            weight: data.weight?.toString() || '',
            age: data.age?.toString() || '',
            chronicDisease: data.chronic_diseases ?? [],
            customChronic: data.chronic_custom ?? [],
            majorIllness: data.major_illness_history || '',
            surgeryHistory: data.surgery_history || '',
        });

        if (data.name) {
            setUserName(data.name);
        }
    };

    // 載入伺服器上的健康檔案
    useEffect(() => {
        getPersonalHealthProfile()
            .then(handleUserProfileData)
            .catch((error: unknown) => {
                console.warn('載入使用者資料失敗:', error);
                toast.error(
                    error instanceof Error ? error.message : t('personalHealth.loadError'),
                );
            });
        // 僅在掛載時載入；語言切換不需重抓 API
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // LIFF 就緒後補上顯示名稱與頭像。伺服器有姓名時以伺服器為準
    // handleLiffProfile 內的 `prev ||` 與 `!getValues('name')` 就是為此，
    // 所以這兩個 effect 誰先回來都不影響結果。
    useEffect(() => {
        if (!liffReady) return;
        // liff.getProfile() 在 LIFF session 未登入時是「同步」丟錯（'You need to
        // call liff.login first.'），不是回傳 rejected promise —— .then().catch()
        // 接不到，例外會往上竄，整個 PersonalHealthPage 被 React 卸載成白畫面。
        // 使用者手上有有效的 CARE token 但 LINE session 過期時就會踩到。
        void (async () => {
            try {
                handleLiffProfile(await liff.getProfile());
            } catch (err) {
                console.warn('獲取 LIFF 用戶資訊失敗:', err);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liffReady]);

    useEffect(() => {
        if (liffError) console.warn('LIFF 初始化失敗:', liffError);
    }, [liffError]);

    const handleChronicToggle = (value: string) => {
        const current = getValues('chronicDisease');
        const exists = current.includes(value);
        setValue(
            'chronicDisease',
            exists ? current.filter((item) => item !== value) : [...current, value],
            { shouldValidate: true },
        );
    };

    /**
     * 把輸入框的內容加進清單。回傳這次的結果，讓呼叫端決定要不要提示——
     * 使用者主動按「新增」時要提示重複，送出時自動補加則安靜處理。
     */
    const commitCustomDraft = () => {
        const result = addCustomChronic(
            getValues('chronicDisease'),
            getValues('customChronic'),
            customDraft,
            t,
        );
        if (result.status === 'added' || result.status === 'matchedFixed') {
            setValue('chronicDisease', result.selected, { shouldValidate: true });
            setValue('customChronic', result.custom, { shouldValidate: true });
        }
        if (result.status !== 'empty') {
            setCustomDraft('');
        }
        return result.status;
    };

    const handleAddCustom = () => {
        const name = customDraft.trim();
        if (commitCustomDraft() === 'duplicate') {
            toast.error(t('personalHealth.chronicOtherDuplicate', { name }));
        }
    };

    const handleRemoveCustom = (name: string) => {
        setValue(
            'customChronic',
            getValues('customChronic').filter((item) => item !== name),
            { shouldValidate: true },
        );
    };

    // 驗證交給 resolver；handleSubmit 的失敗分支負責提示。
    const handleSave = () =>
        new Promise<void>((resolve, reject) => {
            // 打了字卻沒按「新增」就送出：幫他補上，而不是丟掉或擋下整次儲存。
            commitCustomDraft();

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
        const payload = {
            name: form.name,
            gender: form.gender,
            height: Number(form.height),
            weight: Number(form.weight),
            age: Number(form.age),
            // 表單狀態與後端欄位一對一，不需要任何攤平或還原
            chronic_diseases: form.chronicDisease,
            chronic_custom: form.customChronic,
            // 空字串就是「沒有」，不再塞「無」這種混在資料裡的哨兵值
            major_illness_history: form.majorIllness.trim(),
            surgery_history: form.surgeryHistory.trim(),
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

    const numericError = (field: NumericFieldName) =>
        validateNumericField(form[field], field, t);
    const isBasicStepComplete = Boolean(
        form.name.trim() && form.gender && !numericError('age'),
    );
    const isBodyStepComplete = !numericError('height') && !numericError('weight');
    const canContinue =
        currentStep === 1
            ? isBasicStepComplete
            : currentStep === 2
                ? isBodyStepComplete
                : true;

    const genderLabel = form.gender
        ? t(
            GENDER_OPTIONS.find((option) => option.value === form.gender)?.labelKey
                ?? 'personalHealth.genderPlaceholder',
        )
        : t('personalHealth.genderPlaceholder');

    // 100dvh 而非 100vh：iOS Safari 的 vh 不含網址列，捲動時高度會跳
    return (
        <div className="mx-auto flex min-h-[100dvh] max-w-[800px] flex-col px-4 py-8 max-[600px]:px-3 max-[600px]:py-6">
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
                            <ChronicDiseaseField
                                selected={form.chronicDisease}
                                onToggle={handleChronicToggle}
                                custom={form.customChronic}
                                onRemoveCustom={handleRemoveCustom}
                                draft={customDraft}
                                onDraftChange={setCustomDraft}
                                onAddCustom={handleAddCustom}
                            />

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

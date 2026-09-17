import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RotateCwIcon, TriangleAlertIcon } from 'lucide-react';
import {
    upsertPersonalHealthProfile,
    getPersonalHealthProfile,
} from '../../api/profileApi';
import liff from '@line/liff';
import { useLiff } from '../../hooks/useLiff';
import Stepper, { Step } from './Stepper';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/queryClient';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { FieldGroup } from '@/components/ui/field';
import { Item, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { HealthField, HealthInput, HealthTextarea } from './HealthFields';
import { ChronicDiseaseField } from './ChronicDiseaseField';
import {
    GENDER_OPTIONS,
    addCustomChronic,
    defaultData,
    profileToFormValues,
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
    const queryClient = useQueryClient();
    const [currentStep, setCurrentStep] = useState(1);
    // 自訂病名的輸入框內容。已新增的病名放在表單的 customChronic 陣列裡，
    // 這裡只是還沒按下「新增」的那一行字。
    const [customDraft, setCustomDraft] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const { liffReady, liffError } = useLiff();
    const navigate = useNavigate();

    // 伺服器上的健康檔案。與首頁、側欄同一組 key，進這頁時多半已經有快取。
    // data 為 null＝404，還沒建檔；undefined＝還沒讀到任何一份。
    const {
        data: profile,
        isError: profileLoadFailed,
        isFetching: profileFetching,
        refetch: refetchProfile,
    } = useQuery({
        queryKey: queryKeys.myProfile,
        queryFn: () => getPersonalHealthProfile(),
    });

    // LINE 的顯示名稱與頭像，只拿來預填。liff.getProfile() 在 LINE session 未登入時
    // 是「同步」丟錯（'You need to call liff.login first.'），放進 queryFn 由
    // TanStack Query 接住，不會讓整頁被 React 卸載成白畫面。不重試：那不是網路問題，
    // 重試一樣會丟。
    const { data: liffProfile } = useQuery({
        queryKey: queryKeys.liffProfile,
        queryFn: () => liff.getProfile(),
        enabled: liffReady,
        retry: false,
        staleTime: Infinity,
    });
    const liffName = liffProfile?.displayName?.trim() ?? '';
    const userAvatar = liffProfile?.pictureUrl?.trim() ?? '';
    // 伺服器有姓名時以伺服器為準，否則用 LINE 的顯示名稱
    const userName = profile?.name || liffName;

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

    // 表單值由資料算出來，不在 effect 裡搬。`values` 一變，react-hook-form 會自己
    // 同步；keepDirtyValues 讓背景重抓（或 LINE 名稱晚一步回來）只補使用者還沒
    // 動過的欄位，不會蓋掉他正在打的字。
    const values = useMemo<HealthData | undefined>(() => {
        if (profile === undefined) return undefined;
        const fromServer = profileToFormValues(profile);
        return { ...fromServer, name: fromServer.name || liffName };
    }, [profile, liffName]);

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        getValues,
        formState: { errors },
    } = useForm<HealthData>({
        resolver: zodResolver(schema),
        defaultValues: defaultData,
        values,
        resetOptions: { keepDirtyValues: true },
        mode: 'onBlur',
        reValidateMode: 'onChange',
    });

    const form = watch();

    useEffect(() => {
        if (liffError) console.warn('LIFF 初始化失敗:', liffError);
    }, [liffError]);

    // 以下的 setValue 都帶 shouldDirty：沒標成 dirty 的欄位，背景重抓回來時會被
    // keepDirtyValues 當成「使用者沒動過」而換成伺服器的值。

    const handleChronicToggle = (value: string) => {
        const current = getValues('chronicDisease');
        const exists = current.includes(value);
        setValue(
            'chronicDisease',
            exists ? current.filter((item) => item !== value) : [...current, value],
            { shouldValidate: true, shouldDirty: true },
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
            setValue('chronicDisease', result.selected, { shouldValidate: true, shouldDirty: true });
            setValue('customChronic', result.custom, { shouldValidate: true, shouldDirty: true });
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
            { shouldValidate: true, shouldDirty: true },
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
            // 首頁與側欄共用這份快取。重抓回來的值與剛送出的相同，
            // keepDirtyValues 下不會動到畫面上的欄位。
            void queryClient.invalidateQueries({ queryKey: queryKeys.myProfile });
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

    // 讀到伺服器資料之前不給表單（null＝還沒建檔，也算讀到）。後端的
    // PUT /me/update 是整份覆寫：讀取失敗時若照樣顯示空白表單，使用者按一次
    // 儲存就會清掉原本的慢性病與病史。背景重抓失敗但手上已有資料時照常顯示，
    // 那份資料是真的。
    const profileState =
        profile !== undefined ? 'ready' : profileLoadFailed ? 'error' : 'loading';

    // 內頁不撐 min-h-[100dvh]：外面已經有 header 與底部導覽，撐滿只會在內容
    // 之後多出一截空白可捲。左右留白由 .content-area 統一給，這裡不再加。
    return (
        <div className="mx-auto flex max-w-[800px] flex-col">
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

            {profileState === 'loading' ? (
                <p
                    role="status"
                    className="flex items-center justify-center gap-2 py-12 text-base text-muted-foreground"
                >
                    <Spinner aria-hidden="true" />
                    {t('personalHealth.loading')}
                </p>
            ) : profileState === 'error' ? (
                // 靠左的 Alert＋整寬按鈕，不用置中的 Empty：特大字級下 Empty 的留白與
                // 置中會把標題切成兩截，「重新載入」也會被擠到底部導覽列後面。
                <div className="flex flex-col gap-3">
                    <Alert variant="destructive" className="text-base">
                        <TriangleAlertIcon />
                        <AlertTitle>{t('personalHealth.loadError')}</AlertTitle>
                        <AlertDescription className="text-base leading-relaxed">
                            {t('personalHealth.loadErrorGuard')}
                        </AlertDescription>
                    </Alert>
                    <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        className="h-auto min-h-12 w-full py-2 whitespace-normal"
                        disabled={profileFetching}
                        onClick={() => void refetchProfile()}
                    >
                        {profileFetching ? (
                            <Spinner aria-hidden="true" data-icon="inline-start" />
                        ) : (
                            <RotateCwIcon data-icon="inline-start" />
                        )}
                        {t('personalHealth.retry')}
                    </Button>
                </div>
            ) : (
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
                                    {/* 儲存值是 code（'male'/'female'），
                                        故 SelectValue 需以函式 child 對應回翻譯標籤，
                                        否則介面會顯示 code 而不是當前語系的標籤。 */}
                                    <Select
                                        value={form.gender}
                                        onValueChange={(value) =>
                                            setValue('gender', value ?? '', {
                                                shouldValidate: true,
                                                shouldDirty: true,
                                            })
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
                                    hint={t('personalHealth.rangeHint', { min: 1, max: 130, unit: t('personalHealth.unit.age') })}
                                    error={errors.age}
                                >
                                    <HealthInput
                                        id="age"
                                        type="number"
                                        inputMode="numeric"
                                        min="1"
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
                                        inputMode="decimal"
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
                                        inputMode="decimal"
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
            )}
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

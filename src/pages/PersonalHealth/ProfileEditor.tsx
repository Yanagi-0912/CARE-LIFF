import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { HealthProfile } from '@/api/profileApi';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FieldGroup } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { HealthField, HealthInput, HealthTextarea } from './HealthFields';
import { ChronicDiseaseField } from './ChronicDiseaseField';
import { CHRONIC_OPTIONS, GENDER_OPTIONS, addCustomChronic, defaultData, profileToFormValues, validateNumericField, type HealthData, type NumericFieldName } from './healthForm';

type Props = {
    profile: HealthProfile | null;
    liffName: string;
    isSaving: boolean;
    onSave: (form: HealthData) => Promise<void>;
    onCancel: () => void;
};

export default function ProfileEditor({ profile, liffName, isSaving, onSave, onCancel }: Props) {
    const { t } = useTranslation();
    const [customDraft, setCustomDraft] = useState('');
    const submissionInFlight = useRef(false);
    const [expanded, setExpanded] = useState(false);
    // 數值欄位的驗證沿用既有的 validateNumericField，包成 zod 的 superRefine，
    // 訊息與規則完全不變（避免重寫時漂移）。
    const schema = useMemo(() => {
        const numeric = (field: NumericFieldName) =>
            z.string().superRefine((value, ctx) => {
                const message = validateNumericField(value, field, t);
                if (message) ctx.addIssue({ code: 'custom', message });
            });
        return z.object({
            name: z.string().trim().min(1, t('personalHealth.validation.required', { label: t('personalHealth.name') })),
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
        const fromServer = profileToFormValues(profile);
        return { ...fromServer, name: fromServer.name || liffName };
    }, [profile, liffName]);

    const {
        register,
        handleSubmit,
        control,
        setValue,
        getValues,
        formState: { errors, isDirty },
    } = useForm<HealthData>({
        resolver: zodResolver(schema),
        defaultValues: defaultData,
        values,
        resetOptions: { keepDirtyValues: true },
        mode: 'onBlur',
        reValidateMode: 'onChange',
    });

    const form = useWatch({ control, compute: values => values });
    useEffect(() => {
        if (!isDirty && !customDraft.trim() && !isSaving) return;
        const warnBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', warnBeforeUnload);
        return () => window.removeEventListener('beforeunload', warnBeforeUnload);
    }, [isDirty, customDraft, isSaving]);


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

    const historyCount = form.chronicDisease.length + form.customChronic.length
        + Number(Boolean(form.majorIllness.trim())) + Number(Boolean(form.surgeryHistory.trim()));
    const chronicSummary = [
        ...form.chronicDisease.map(code => {
            const option = CHRONIC_OPTIONS.find(option => option.value === code);
            return option ? t(option.labelKey) : code;
        }),
        ...form.customChronic,
    ].join(t('personalHealth.listSeparator'));

    const canSave = Boolean(form.name.trim() && form.gender &&
        !validateNumericField(form.age, 'age', t) &&
        !validateNumericField(form.height, 'height', t) &&
        !validateNumericField(form.weight, 'weight', t));
    const genderLabel = form.gender
        ? t(GENDER_OPTIONS.find(option => option.value === form.gender)?.labelKey ?? 'personalHealth.genderPlaceholder')
        : t('personalHealth.genderPlaceholder');

    return (
        <form id="personalHealthForm" className="flex flex-col gap-5" noValidate
            onSubmit={event => {
                event.preventDefault();
                if (isSaving || submissionInFlight.current) return;
                // resolver 是非同步的，先上鎖才能擋住同一輪事件裡的重複 submit。
                submissionInFlight.current = true;
                commitCustomDraft();
                void handleSubmit(onSave, () => toast.error(t('personalHealth.fieldErrorToast')))()
                    .finally(() => { submissionInFlight.current = false; });
            }}>
            <fieldset disabled={isSaving} className="min-w-0 space-y-5">
                <section className="profile-form-section" aria-labelledby="profile-basic-title">
                    <h2 id="profile-basic-title">{t('personalHealth.step1.title')}</h2>
                    <div className="profile-fields">
                        <div className="col-span-full"><HealthField htmlFor="name" label={t('personalHealth.name')} error={errors.name}>
                            <HealthInput
                                id="name"
                                placeholder={t('personalHealth.namePlaceholder')}
                                register={register('name')}
                                invalid={Boolean(errors.name)}
                            />
                        </HealthField></div>

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
                    </div>
                </section>
                <section className="profile-form-section" aria-labelledby="profile-body-title">
                    <h2 id="profile-body-title">{t('personalHealth.step2.title')}</h2>
                    <div className="profile-fields">
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
                    </div>
                </section>
                <section className="profile-form-section">
                    <button type="button" className="profile-history-toggle" aria-expanded={expanded}
                        aria-controls="profile-history" onClick={() => setExpanded(!expanded)}>
                        <span><strong>{t('personalHealth.step3.title')}</strong><span className="block text-sm font-normal text-muted-foreground">{historyCount ? t('personalHealth.historyCount', { count: historyCount }) : t('personalHealth.historyHint')}</span></span>
                        <ChevronDownIcon aria-hidden="true" className={expanded ? 'size-5 rotate-180' : 'size-5'} />
                    </button>
                    {/* 保持欄位掛載，收合不會丟失尚未儲存的病史。 */}
                    <div id="profile-history" hidden={!expanded} className="pt-4">
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

                                {chronicSummary && <p className="flex items-start gap-2 text-base text-primary">
                                    <CheckIcon aria-hidden="true" className="mt-1 size-5 shrink-0" />
                                    <span>{t('personalHealth.selectedChronicSummary', { conditions: chronicSummary })}</span>
                                </p>}

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
                    </div>
                </section>
                {!canSave && <p className="text-sm text-muted-foreground">{t('personalHealth.requiredHint')}</p>}
                <div className="grid grid-cols-2 gap-3">
                    <Button type="button" variant="outline" onClick={onCancel}>{t('personalHealth.cancel')}</Button>
                    <Button type="submit" disabled={!canSave || isSaving}>
                        {isSaving && <Spinner aria-hidden="true" />}
                        {t(isSaving ? 'personalHealth.saving' : 'personalHealth.save')}
                    </Button>
                </div>
            </fieldset>
        </form>
    );
}

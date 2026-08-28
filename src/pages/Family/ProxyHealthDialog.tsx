import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';

import { getPersonalHealthProfile, proxyUpsertHealthProfile } from '../../api/profileApi';
import type { FamilyMember } from '../../types/family';
import { queryKeys } from '@/lib/queryClient';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldGroup } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { HealthField, HealthInput, HealthTextarea } from '../PersonalHealth/HealthFields';
import { ChronicDiseaseField } from '../PersonalHealth/ChronicDiseaseField';
import {
  GENDER_OPTIONS,
  addCustomChronic,
  defaultData,
  validateNumericField,
  type HealthData,
  type NumericFieldName,
} from '../PersonalHealth/healthForm';

interface Props {
  member: FamilyMember;
  onClose: () => void;
}

/**
 * 代填家人的健康資料。
 *
 * 與「我自己」那一頁共用欄位元件（HealthField／ChronicDiseaseField）與驗證
 * 規則，但**資料流是分開的**：那一頁從 LIFF profile 帶入姓名頭像、走三步驟
 * Stepper、寫 `/me/update`；這裡是一次填完的對話框、寫
 * `PUT /api/profiles/{userId}`。共用元件是為了兩邊的欄位規則不會漂移，
 * 不是為了把兩種情境擠進同一個表單。
 *
 * **不提供姓名與照片的編輯。** 那兩個欄位由本人設定，後端也會剝除——在這裡
 * 放一個送出去會被無聲忽略的輸入框，比不放更糟。
 */
export function ProxyHealthDialog({ member, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [customDraft, setCustomDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const displayName = member.display_name || member.user_id.slice(0, 8);

  const schema = useMemo(() => {
    const numeric = (field: NumericFieldName) =>
      z.string().superRefine((value, ctx) => {
        const message = validateNumericField(value, field, t);
        if (message) ctx.addIssue({ code: 'custom', message });
      });
    return z.object({
      name: z.string(),
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

  // 先讀回既有資料再填：代填不是重建，長輩已經填過的內容不該因為家人開了
  // 這個對話框就被清空。
  //
  // 這支查詢與 MemberCard 共用同一個 query key，所以卡片展開過之後，這裡拿到
  // 的是**快取**，`queryFn` 根本不會執行。填表的邏輯因此 SHALL NOT 寫在
  // `queryFn` 裡——那條路徑在最常見的操作順序（展開卡片 → 按代填）下不會跑到，
  // 表單會是空的，而使用者會把空白當成「還沒填」，一路覆蓋掉既有資料。
  const { data: profile, isPending } = useQuery({
    queryKey: queryKeys.memberProfile(member.user_id),
    queryFn: () => getPersonalHealthProfile(member.user_id),
  });

  // 由資料驅動表單值，不由請求的生命週期驅動。`values` 在拿到（或換掉）資料時
  // 自行同步，快取命中與實際發出請求兩條路徑因此收斂到同一個結果。
  const values = useMemo<HealthData | undefined>(() => {
    if (!profile) return undefined;
    return {
      ...defaultData,
      name: profile.name || '',
      gender: profile.gender === 'unknown' ? '' : profile.gender || '',
      height: profile.height?.toString() || '',
      weight: profile.weight?.toString() || '',
      age: profile.age?.toString() || '',
      chronicDisease: profile.chronic_diseases ?? [],
      customChronic: profile.chronic_custom ?? [],
      majorIllness: profile.major_illness_history || '',
      surgeryHistory: profile.surgery_history || '',
    };
  }, [profile]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<HealthData>({
    resolver: zodResolver(schema),
    defaultValues: defaultData,
    values,
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  const form = watch();

  const handleAddChronic = () => {
    // 與「我自己」那一頁走同一支純函式：使用者打的是當前語系的病名
    // （「高血壓」而不是 hypertension），比對規則不該有兩份。
    const result = addCustomChronic(
      form.chronicDisease,
      form.customChronic,
      customDraft,
      t,
    );
    if (result.status === 'added' || result.status === 'matchedFixed') {
      setValue('chronicDisease', result.selected, { shouldValidate: true });
      setValue('customChronic', result.custom, { shouldValidate: true });
    }
    if (result.status !== 'empty') setCustomDraft('');
  };

  const onSubmit = async (data: HealthData) => {
    setSaving(true);
    try {
      await proxyUpsertHealthProfile(member.user_id, {
        // 不送 name。這條路徑不寫顯示名稱，而讀回來的值可能是空字串
        // （對方沒填，或該欄位被遮蔽），送出去只會撞上後端的欄位驗證。
        gender: data.gender,
        height: Number(data.height),
        weight: Number(data.weight),
        age: Number(data.age),
        chronic_diseases: data.chronicDisease,
        chronic_custom: data.customChronic,
        major_illness_history: data.majorIllness,
        surgery_history: data.surgeryHistory,
        health_consultations: {},
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.memberProfile(member.user_id),
      });
      toast.success(t('familyPermission.proxyEditSaved', { name: displayName }));
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('familyPermission.proxyEditError'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>
            {t('familyPermission.proxyEditTitle', { name: displayName })}
          </DialogTitle>
          <DialogDescription>
            {t('familyPermission.proxyEditDesc')}
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          <p
            className="flex items-center gap-2 py-6 text-base text-muted-foreground"
            role="status"
          >
            <Spinner />
            {t('family.healthLoading')}
          </p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup>
              <HealthField
                htmlFor="proxy-gender"
                label={t('personalHealth.gender')}
                error={errors.gender}
              >
                <Select
                  value={form.gender}
                  onValueChange={(value) => setValue('gender', value ?? '')}
                >
                  <SelectTrigger id="proxy-gender" className="w-full">
                    <SelectValue placeholder={t('personalHealth.genderPlaceholder')} />
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
                htmlFor="proxy-age"
                label={t('personalHealth.field.age')}
                error={errors.age}
              >
                <HealthInput
                  id="proxy-age"
                  type="number"
                  invalid={!!errors.age}
                  register={register('age')}
                />
              </HealthField>

              <HealthField
                htmlFor="proxy-height"
                label={t('personalHealth.field.height')}
                error={errors.height}
              >
                <HealthInput
                  id="proxy-height"
                  type="number"
                  invalid={!!errors.height}
                  register={register('height')}
                />
              </HealthField>

              <HealthField
                htmlFor="proxy-weight"
                label={t('personalHealth.field.weight')}
                error={errors.weight}
              >
                <HealthInput
                  id="proxy-weight"
                  type="number"
                  invalid={!!errors.weight}
                  register={register('weight')}
                />
              </HealthField>

              <ChronicDiseaseField
                selected={form.chronicDisease}
                custom={form.customChronic}
                draft={customDraft}
                onDraftChange={setCustomDraft}
                onToggle={(code) =>
                  setValue(
                    'chronicDisease',
                    form.chronicDisease.includes(code)
                      ? form.chronicDisease.filter((item) => item !== code)
                      : [...form.chronicDisease, code],
                  )
                }
                onAddCustom={handleAddChronic}
                onRemoveCustom={(name) =>
                  setValue(
                    'customChronic',
                    form.customChronic.filter((item) => item !== name),
                  )
                }
              />

              <HealthField
                htmlFor="proxy-major"
                label={t('personalHealth.majorIllness')}
                error={errors.majorIllness}
              >
                <HealthTextarea
                  id="proxy-major"
                  register={register('majorIllness')}
                />
              </HealthField>

              <HealthField
                htmlFor="proxy-surgery"
                label={t('personalHealth.surgeryHistory')}
                error={errors.surgeryHistory}
              >
                <HealthTextarea
                  id="proxy-surgery"
                  register={register('surgeryHistory')}
                />
              </HealthField>
            </FieldGroup>

            <div className="mt-6 flex flex-col gap-2">
              <Button type="submit" size="lg" disabled={saving}>
                {saving ? <Spinner /> : null}
                {saving ? t('familyRole.manage.saving') : t('familyPermission.save')}
              </Button>
              <DialogClose render={<Button type="button" variant="ghost" />}>
                {t('familyPermission.cancel')}
              </DialogClose>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

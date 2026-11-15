import { useId, useRef } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { careTopics, type CareAssignee, type CareTopic, type NewCareTask } from '@/api/longTermCareApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

const schema = z.object({
  topic: z.enum(careTopics),
  assignee: z.string().min(1),
  reminderEnabled: z.boolean(),
  reminderDate: z.string(),
  reminderTime: z.string(),
}).refine(
  (value) => !value.reminderEnabled
    || new Date(`${value.reminderDate}T${value.reminderTime}`).getTime() > Date.now(),
  { path: ['reminderTime'] },
);
type FormValues = z.infer<typeof schema>;

export function CareTaskForm({
  topic, assignees, busy, onCreate,
}: {
  topic: CareTopic;
  assignees: CareAssignee[];
  busy: boolean;
  onCreate: (task: NewCareTask) => Promise<void>;
}) {
  const { t } = useTranslation();
  const fieldId = useId();
  const pending = useRef<{ id: string; values: string } | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      topic, assignee: assignees[0]?.id ?? '', reminderEnabled: false, reminderDate: '', reminderTime: '',
    },
  });

  const showReminder = useWatch({ control: form.control, name: 'reminderEnabled' });

  async function save(values: FormValues) {
    const reminder = values.reminderEnabled
      ? new Date(`${values.reminderDate}T${values.reminderTime}`).toISOString()
      : null;
    const fingerprint = JSON.stringify([values.topic, values.assignee, reminder]);
    if (pending.current?.values !== fingerprint) {
      pending.current = { id: crypto.randomUUID(), values: fingerprint };
    }
    try {
      await onCreate({
        id: pending.current.id,
        topic: values.topic,
        assignee_id: values.assignee,
        remind_at: reminder,
      });
      pending.current = null;
      form.reset();
    } catch {
      // 顯示 mutation 的錯誤，重送相同內容時沿用原識別碼。
    }
  }

  const topicItems = careTopics.map((value) => ({ value, label: t(`careTask.topic.${value}`) }));
  const assigneeItems = assignees.map(({ id, name }, index) => ({
    value: id, label: index === 0 ? t('meds.self') : name || t('family.unset'),
  }));

  return (
    <form onSubmit={(event) => void form.handleSubmit(save)(event)} className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="text-lg font-semibold">{t('careTask.add')}</h2>
      <div className="space-y-2">
        <Label htmlFor={`${fieldId}-topic`}>{t('careTask.service')}</Label>
        <Controller control={form.control} name="topic" render={({ field }) => (
          <Select items={topicItems} value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id={`${fieldId}-topic`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {topicItems.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        )} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${fieldId}-assignee`}>{t('careTask.assignee')}</Label>
        <Controller control={form.control} name="assignee" render={({ field }) => (
          <Select items={assigneeItems} value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id={`${fieldId}-assignee`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {assigneeItems.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        )} />
      </div>
      <div className="flex min-h-11 items-center justify-between gap-4">
        <Label id={`${fieldId}-reminder-label`} htmlFor={`${fieldId}-reminder`}>{t('careTask.reminderOptional')}</Label>
        <Controller control={form.control} name="reminderEnabled" render={({ field }) => (
          <Switch id={`${fieldId}-reminder`} aria-labelledby={`${fieldId}-reminder-label`}
            checked={field.value} onCheckedChange={field.onChange} />
        )} />
      </div>
      {showReminder && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <Label htmlFor={`${fieldId}-date`}>{t('careTask.reminderDate')}</Label>
            <Input id={`${fieldId}-date`} type="date" className="w-full"
              {...form.register('reminderDate')} />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor={`${fieldId}-time`}>{t('careTask.reminderTime')}</Label>
            <Input id={`${fieldId}-time`} type="time" className="w-full"
              aria-invalid={Boolean(form.formState.errors.reminderTime)}
              {...form.register('reminderTime')} />
          </div>
          {form.formState.errors.reminderTime && (
            <p className="text-sm text-destructive md:col-span-2" role="alert">{t('careTask.futureTime')}</p>
          )}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={busy}>{t('careTask.save')}</Button>
    </form>
  );
}

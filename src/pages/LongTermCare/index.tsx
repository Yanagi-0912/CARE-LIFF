import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon, CheckIcon, ClockIcon, ExternalLinkIcon, XIcon } from 'lucide-react';

import {
  CareTaskApiError, careTopics, createCareTask, fetchCareTasks, fetchCareTaskTarget,
  updateCareTask, type CareStatus, type CareStatusUpdate, type NewCareTask,
} from '@/api/longTermCareApi';
import { Button } from '@/components/ui/button';
import { canManageAppointments, canReadClinicVisits } from '@/utils/familyPermissions';
import { ReminderTargetToggle } from '../Reminders/ReminderTargetToggle';
import { useReminderTargets } from '../Reminders/useReminderTargets';
import { CareTaskForm } from './CareTaskForm';

const nextStatus: Partial<Record<CareStatus, CareStatusUpdate>> = {
  assigned: 'accepted', accepted: 'contacted', contacted: 'done',
};

export default function LongTermCarePage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const topicParam = params.get('topic');
  const topic = careTopics.find((value) => value === topicParam) ?? 'discharge';
  const focus = params.get('task');
  const queryClient = useQueryClient();
  const {
    members, selfUserId, targets, selectedUserId, setSelectedUserId,
  } = useReminderTargets(canManageAppointments, canReadClinicVisits);

  const focusQuery = useQuery({
    queryKey: ['care-task-target', selfUserId, focus],
    queryFn: () => fetchCareTaskTarget(focus!),
    enabled: Boolean(focus),
    retry: false,
  });
  const target = focusQuery.data ?? selectedUserId;
  const queryKey = ['care-tasks', selfUserId, target];
  const tasksQuery = useQuery({
    queryKey,
    queryFn: () => fetchCareTasks(target),
    enabled: !focus || !focusQuery.isPending,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const create = useMutation({
    mutationFn: (task: NewCareTask) => createCareTask(target, task),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CareStatusUpdate }) => updateCareTask(id, status),
    onSuccess: refresh,
    onError: refresh,
  });

  const error = create.error ?? update.error ?? tasksQuery.error;
  const errorKey = error instanceof CareTaskApiError && error.status === 403
    ? 'careTask.forbidden'
    : error instanceof CareTaskApiError && error.status === 409
      ? 'careTask.changed'
      : 'careTask.error';
  const assignees = tasksQuery.data?.assignees ?? [];
  const taskList = tasksQuery.data?.tasks ?? [];
  const orderedTasks = focus
    ? [...taskList].sort((a, b) => Number(b.id === focus) - Number(a.id === focus))
    : taskList;
  const busy = create.isPending || update.isPending;

  function selectTarget(id: string | undefined) {
    const next = new URLSearchParams(params);
    next.delete('task');
    setParams(next, { replace: true });
    setSelectedUserId(id);
    create.reset();
    update.reset();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header className="space-y-2">
        <Link to="/family" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium">
          <ArrowLeftIcon className="size-4" aria-hidden="true" />{t('nav.family')}
        </Link>
        <h1 className="text-2xl font-extrabold">{t('careTask.title')}</h1>
        <p className="leading-relaxed text-muted-foreground">{t('careTask.description')}</p>
        <a href="https://1966.gov.tw/LTC/cp-6533-70777-207.html" target="_blank" rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-2 text-primary underline">
          {t('careTask.official')}<ExternalLinkIcon className="size-4 shrink-0" aria-hidden="true" />
        </a>
      </header>

      <ReminderTargetToggle targets={targets} selectedUserId={target}
        selfUserId={selfUserId} onSelect={selectTarget} label={t('careTask.target')} />

      {(tasksQuery.isPending || (focus && focusQuery.isPending)) && (
        <p role="status" className="text-muted-foreground">{t('careTask.loading')}</p>
      )}
      {focusQuery.isError && <p role="alert">{t('careTask.linkUnavailable')}</p>}
      {error && <p role="alert" className="text-destructive">{t(errorKey)}</p>}
      {tasksQuery.isError && (
        <Button variant="outline" onClick={() => void tasksQuery.refetch()}>{t('family.retry')}</Button>
      )}

      {orderedTasks.length > 0 && (
        <section className="space-y-3" aria-label={t('careTask.title')}>
          {orderedTasks.map((task) => {
            const action = assignees.length && task.assignee_id === selfUserId ? nextStatus[task.status] : undefined;
            const canCancel = Boolean(nextStatus[task.status]) && assignees.length > 0
              && [task.creator_id, task.assignee_id, target ?? selfUserId].includes(selfUserId ?? '');
            const assigneeName = task.assignee_id === selfUserId
              ? t('meds.self')
              : assignees.find((member) => member.id === task.assignee_id)?.name
                || members.find((member) => member.user_id === task.assignee_id)?.display_name
                || t('nav.family');
            const StatusIcon = task.status === 'done' ? CheckIcon : task.status === 'cancelled' ? XIcon : ClockIcon;
            return (
              <article key={task.id} className={`space-y-2 rounded-xl border bg-card p-4 ${task.id === focus ? 'border-primary' : ''}`}>
                <h2 className="text-lg font-semibold">{t(`careTask.topic.${task.topic}`)}</h2>
                <p className="flex items-center gap-2 font-medium">
                  <StatusIcon className="size-4 shrink-0" aria-hidden="true" />
                  {t(`careTask.status.${task.status}`)}
                </p>
                <p className="text-sm">{t('careTask.assignedTo', { name: assigneeName })}</p>
                {task.remind_at && (
                  <p className="text-sm">{t('careTask.reminderAt', {
                    time: new Date(task.remind_at).toLocaleString(i18n.language, {
                      dateStyle: 'medium', timeStyle: 'short',
                    }),
                  })}</p>
                )}
                {(action || canCancel) && (
                  <div className="flex flex-wrap gap-2">
                    {action && <Button disabled={busy}
                      onClick={() => update.mutate({ id: task.id, status: action })}>
                      {t(`careTask.action.${action}`)}
                    </Button>}
                    {canCancel && <Button variant="outline" disabled={busy}
                      onClick={() => update.mutate({ id: task.id, status: 'cancelled' })}>
                      {t('careTask.action.cancelled')}
                    </Button>}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
      {tasksQuery.isSuccess && orderedTasks.length === 0 && (
        <p className="text-muted-foreground">{t('careTask.empty')}</p>
      )}
      {assignees.length > 0 && (
        <CareTaskForm key={`${target}-${topic}`} topic={topic} assignees={assignees}
          busy={busy} onCreate={async (task) => { await create.mutateAsync(task); }} />
      )}
    </div>
  );
}

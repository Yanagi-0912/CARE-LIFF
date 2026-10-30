import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon, CheckIcon, ChevronRightIcon, DownloadIcon, EllipsisIcon, MessageSquareIcon, RotateCcwIcon, TagsIcon } from 'lucide-react';
import {
  AnnotationApiError, exportAnnotations, fetchAnnotationSession, fetchAnnotationTasks, saveAnnotation,
  type AnnotationLabel, type AnnotationSession, type AnnotationTaskId,
} from '@/api/annotationsApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { claimExamples, claimRules, healthExamples, healthRules } from './rules';
import SwipeCard from './SwipeCard';

function Rules({ health }: { health: boolean }) {
  return (
    <div className="space-y-4">
      <p>{health
        ? '健康、醫療、身體狀況、疾病、藥物、營養、運動健身、心理健康，或以醫療／健保／保險理賠為名的詐騙，都算健康相關。'
        : '比對兩段話是否講同一件事。不用判斷真假，也不用查資料。'}</p>
      <ol className="list-decimal space-y-2 pl-5">
        {(health ? healthRules : claimRules).map(rule => <li key={rule}>{rule}</li>)}
      </ol>
      <details>
        <summary className="cursor-pointer font-semibold">查看例子</summary>
        <div className="mt-3 space-y-2 text-sm">
          {(health ? healthExamples : claimExamples).map(example => (
            <div key={example[0]} className="rounded-lg border bg-background p-3">
              <p>{example[0]}</p>
              {!health && <p className="mt-1 text-muted-foreground">查核報告：{example[1]}</p>}
              <p className="mt-1 font-semibold text-primary">{example[example.length - 1]}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

type Panel = 'more' | 'rules' | 'note' | null;

function AnnotationForm({ initial, reload, onBack, onBusy }: {
  initial: AnnotationSession; reload: () => void; onBack: () => void; onBusy: (busy: boolean) => void;
}) {
  const [session, setSession] = useState(initial);
  const [position, setPosition] = useState(initial.position);
  const [unsure, setUnsure] = useState(initial.answers[String(initial.position)]?.unsure ?? false);
  const [note, setNote] = useState(initial.answers[String(initial.position)]?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [pilot, setPilot] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [pointMode, setPointMode] = useState(false);
  const lock = useRef(false);
  const shownAt = useRef(0);
  useEffect(() => { shownAt.current = Date.now(); }, []);
  const health = session.task === 'health';
  const items = useMemo(() => new Map(session.items.map(item => [String(item.id), item])), [session.items]);
  const current = session.order[position];
  const item = current ? items.get(String(current.id)) : undefined;
  const previous = session.answers[String(position)];
  const answered = Object.keys(session.answers).length;
  const blocked = saving || exporting || conflict || pilot || panel !== null;

  const moveTo = useCallback((next: number, state = session) => {
    setPosition(next);
    setUnsure(state.answers[String(next)]?.unsure ?? false);
    setNote(state.answers[String(next)]?.note ?? '');
    setError('');
    shownAt.current = Date.now();
  }, [session]);

  const answer = useCallback(async (label: AnnotationLabel): Promise<boolean> => {
    if (lock.current || conflict || !current || pilot || exporting || panel !== null) return false;
    lock.current = true;
    setSaving(true);
    onBusy(true);
    setError('');
    try {
      const saved = await saveAnnotation(session.task, position, {
        fingerprint: session.fingerprint, revision: session.revision,
        label, unsure, note, ms: Math.min(86_400_000, Math.max(0, Date.now() - shownAt.current)),
      });
      const updated = {
        ...session, revision: saved.revision, position: saved.position,
        answers: { ...session.answers, [String(position)]: saved.answer },
      };
      setSession(updated);
      moveTo(saved.position, updated);
      if (!previous && Object.keys(updated.answers).length === session.pilot) setPilot(true);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '尚未儲存，請再滑一次。');
      if (reason instanceof AnnotationApiError && reason.status === 409) setConflict(true);
      return false;
    } finally {
      lock.current = false;
      setSaving(false);
      onBusy(false);
    }
  }, [conflict, current, exporting, moveTo, note, onBusy, panel, pilot, position, previous, session, unsure]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || blocked || !current) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (key === 'j') void answer(1);
      else if (key === 'f') void answer(0);
      else if (key === 'n' && health) void answer(null);
      else if (key === 'u') setUnsure(value => !value);
      else if (key === 'arrowleft' && position > 0) moveTo(position - 1);
      else return;
      event.preventDefault();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [answer, blocked, current, health, moveTo, position]);

  async function download() {
    setExporting(true);
    setError('');
    try {
      const output = await exportAnnotations(session.task);
      const url = URL.createObjectURL(new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${health ? 'health' : 'claim'}_labels_${session.annotator_id.slice(0, 8)}_${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '匯出失敗，請重試。');
    } finally { setExporting(false); }
  }

  const previousLabel = previous ? previous.label === 1 ? health ? '健康相關' : '同一主張'
    : previous.label === 0 ? health ? '無關' : '不同主張' : '無法判斷' : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="返回題組" disabled={saving || exporting} onClick={onBack}><ArrowLeftIcon /></Button>
        <h1 className="flex-1 text-lg font-bold">{session.title}</h1>
        <Button variant="ghost" size="icon" aria-label="更多選項" disabled={saving || exporting} onClick={() => setPanel('more')}><EllipsisIcon /></Button>
      </div>
      <div className="space-y-2 px-1" aria-live="polite">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">{current ? `${position + 1} / ${session.order.length}` : `${answered} 題完成`}</span>
          <span className="inline-flex items-center gap-1" role="status"><CheckIcon className="size-3.5" />{saving ? '儲存中…' : '自動儲存'}</span>
        </div>
        <div role="progressbar" aria-label="標註進度" aria-valuemin={0} aria-valuemax={session.order.length} aria-valuenow={answered} className="h-1 overflow-hidden rounded-full bg-primary/10">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${100 * answered / session.order.length}%` }} />
        </div>
      </div>
      {error && <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <p>{error}</p>
        {conflict && <Button className="mt-2" variant="outline" onClick={reload}>重新載入進度</Button>}
      </div>}
      {pilot && <div role="dialog" aria-label="試標完成" className="rounded-xl border border-primary/40 bg-primary/5 p-4">
        <p className="font-bold">已完成 {session.pilot} 題，休息一下！</p>
        <Button className="mt-3" onClick={() => setPilot(false)}>繼續標註</Button>
      </div>}
      {item ? <>
        {previousLabel && <p className="px-1 text-xs text-muted-foreground">已標：{previousLabel} · 再滑一次可修改</p>}
        <SwipeCard key={`${session.task}:${position}`} health={health} disabled={blocked} onAnswer={answer}>
          {health ? <>
            <p className="mb-4 text-xs font-semibold tracking-wider text-muted-foreground">這則訊息與健康有關嗎？</p>
            <p className="whitespace-pre-wrap break-words text-lg leading-relaxed">{item.t}</p>
          </> : <div className="space-y-6">
            <div><p className="mb-3 text-xs font-semibold text-muted-foreground">使用者的說法</p><p className="whitespace-pre-wrap break-words text-lg leading-relaxed">{item.u}</p></div>
            <div className="border-t pt-5"><p className="mb-3 text-xs font-semibold text-muted-foreground">查核報告在查的</p><p className="whitespace-pre-wrap break-words text-lg leading-relaxed">{item.r}</p></div>
          </div>}
        </SwipeCard>
        <fieldset disabled={blocked} className={cn('gap-2', pointMode ? 'grid' : 'hidden md:grid', health ? 'grid-cols-3' : 'grid-cols-2')}>
          <legend className="sr-only">點選作答</legend>
          <Button variant="outline" aria-pressed={previous?.label === 0} onClick={() => void answer(0)}>{health ? '無關' : '不同主張'}（F）</Button>
          {health && <Button variant="outline" aria-pressed={!!previous && previous.label === null} onClick={() => void answer(null)}>無法判斷（N）</Button>}
          <Button aria-pressed={previous?.label === 1} onClick={() => void answer(1)}>{health ? '健康相關' : '同一主張'}（J）</Button>
        </fieldset>
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" disabled={position === 0 || blocked} onClick={() => moveTo(position - 1)}><RotateCcwIcon />上一題</Button>
          {answered === 0 && <span className="text-xs text-muted-foreground">滑動卡片即可標記</span>}
          <Button variant="ghost" size="icon" aria-label="補充備註" disabled={blocked} onClick={() => setPanel('note')} className={cn((note || unsure) && 'bg-primary/10 text-primary')}><MessageSquareIcon /></Button>
        </div>
        {current && previous && <Button variant="ghost" className="w-full" disabled={blocked} onClick={() => moveTo(position + 1)}>下一題<ChevronRightIcon /></Button>}
      </> : <Card><CardContent className="space-y-2 py-6 text-center">
        <CheckIcon className="mx-auto size-10 text-primary" /><h2 className="text-xl font-bold">標完了，謝謝！</h2><p className="text-sm text-muted-foreground">{answered} 題已儲存</p>
        <Button variant="ghost" onClick={() => moveTo(Math.max(0, position - 1))}><RotateCcwIcon />檢查上一題</Button>
      </CardContent></Card>}
      <Dialog open={panel !== null} onOpenChange={open => { if (!open && !exporting) setPanel(null); }}>
        <DialogContent className="max-h-[80svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{panel === 'rules' ? '判斷規則' : panel === 'note' ? '補充備註' : '更多選項'}</DialogTitle></DialogHeader>
          {panel === 'more' && <div className="space-y-3">
            <p className="text-sm text-muted-foreground">標註者：{session.annotator}</p>
            <Button variant="outline" className="w-full justify-between" onClick={() => setPanel('rules')}>判斷規則與例子<ChevronRightIcon /></Button>
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 md:hidden">
              改用點選作答<input type="checkbox" className="size-5 accent-primary" checked={pointMode} onChange={event => setPointMode(event.target.checked)} />
            </label>
            <div className="border-t pt-4">
              <Button variant="ghost" disabled={exporting} onClick={() => void download()}><DownloadIcon />{exporting ? '匯出中…' : '匯出 JSON'}</Button>
              <p className="mt-1 text-xs text-muted-foreground">分析備份用；答案已自動儲存，不需匯出。</p>
            </div>
            <p className="text-xs text-muted-foreground">題目含重測題，請照當下判斷作答。</p>
            {health && <p className="text-xs text-muted-foreground">資料來源：<a className="underline" href="https://cofacts.tw" target="_blank" rel="noreferrer">Cofacts 真的假的</a> · CC BY-SA 4.0</p>}
          </div>}
          {panel === 'rules' && <Rules health={health} />}
          {panel === 'note' && <div className="space-y-4">
            <label className="flex min-h-11 cursor-pointer items-center gap-3"><input className="size-5 accent-primary" type="checkbox" checked={unsure} onChange={event => setUnsure(event.target.checked)} />拿不準</label>
            <div><label className="mb-2 block text-sm" htmlFor="annotation-note">備註（選填）</label><Textarea id="annotation-note" maxLength={2000} value={note} onChange={event => setNote(event.target.value)} placeholder="寫下原因" /></div>
            <p className="text-xs text-muted-foreground">隨本題答案一起儲存。</p>
            <Button className="w-full" onClick={() => setPanel(null)}>回到卡片</Button>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Workspace({ task, onBusy, onBack }: { task: AnnotationTaskId; onBusy: (busy: boolean) => void; onBack: () => void }) {
  const query = useQuery({
    queryKey: ['admin-annotations', task],
    queryFn: ({ signal }) => fetchAnnotationSession(task, signal),
    staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  if (query.isPending) return <p role="status">載入中…</p>;
  if (query.isError) return <div role="alert"><p>{query.error.message}</p><Button onClick={() => void query.refetch()}>重試</Button></div>;
  return <AnnotationForm key={`${task}:${query.data.revision}`} initial={query.data} reload={() => void query.refetch()} onBusy={onBusy} onBack={onBack} />;
}

export default function AdminAnnotationsPage() {
  const [selected, setSelected] = useState<AnnotationTaskId | null>(null);
  const [busy, setBusy] = useState(false);
  const tasks = useQuery({ queryKey: ['admin-annotation-tasks'], queryFn: fetchAnnotationTasks });
  return (
    <div className="mx-auto max-w-2xl overflow-x-clip px-0.5 pb-2">
      {selected ? <Workspace key={selected} task={selected} onBusy={setBusy} onBack={() => { if (!busy) setSelected(null); }} /> : <div className="space-y-6">
        <div className="flex items-center gap-3"><TagsIcon className="size-6 text-primary" /><h1 className="text-2xl font-bold">標記頁面</h1></div>
        {tasks.isPending && <p role="status">載入中…</p>}
        {tasks.isError && <div role="alert"><p>{tasks.error.message}</p><Button onClick={() => void tasks.refetch()}>重試</Button></div>}
        <div className="grid gap-4 sm:grid-cols-2">
          {tasks.data?.map(task => <button type="button" key={task.id} aria-label={`開始／繼續${task.title}`} onClick={() => setSelected(task.id)} className="group rounded-2xl border bg-card p-6 text-left transition-colors hover:border-primary hover:bg-primary/5">
            <h2 className="text-lg font-bold">{task.title}</h2><p className="mt-2 text-sm text-muted-foreground">{task.question_count.toLocaleString()} 題</p><span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary">開始／繼續<ChevronRightIcon className="size-4" /></span>
          </button>)}
        </div>
      </div>}
    </div>
  );
}

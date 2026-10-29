import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon, CheckCircle2Icon, DownloadIcon, TagsIcon } from 'lucide-react';
import {
  AnnotationApiError, exportAnnotations, fetchAnnotationSession, fetchAnnotationTasks, saveAnnotation,
  type AnnotationLabel, type AnnotationSession, type AnnotationTaskId,
} from '@/api/annotationsApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { claimExamples, claimRules, healthExamples, healthRules } from './rules';

function Rules({ health }: { health: boolean }) {
  return (
    <details className="rounded-xl border bg-muted/30 p-4">
      <summary className="cursor-pointer font-semibold">判斷規則與例子</summary>
      <p className="mt-4">
        {health
          ? '健康、醫療、身體狀況、疾病、藥物、營養、運動健身、心理健康，或以醫療／健保／保險理賠為名的詐騙，都算健康相關。'
          : '比對兩段話是否講同一件事。不用判斷真假，也不用查資料。'}
      </p>
      <ol className="mt-3 list-decimal space-y-2 pl-5">
        {(health ? healthRules : claimRules).map(rule => <li key={rule}>{rule}</li>)}
      </ol>
      <div className="mt-4 space-y-2 text-sm">
        <p className="font-semibold">示意例子（不在題目裡）</p>
        {(health ? healthExamples : claimExamples).map(example => (
          <div key={example[0]} className="rounded-lg border bg-background p-3">
            <p>{example[0]}</p>
            {!health && <p className="mt-1 text-muted-foreground">查核報告：{example[1]}</p>}
            <p className="mt-1 font-semibold text-primary">{example[example.length - 1]}</p>
          </div>
        ))}
      </div>
    </details>
  );
}

function AnnotationForm({ initial, reload, onBusy }: {
  initial: AnnotationSession; reload: () => void; onBusy: (busy: boolean) => void;
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
  const lock = useRef(false);
  const shownAt = useRef(0);
  const questionTop = useRef<HTMLDivElement>(null);
  useEffect(() => { shownAt.current = Date.now(); }, []);
  const health = session.task === 'health';
  const items = useMemo(() => new Map(session.items.map(item => [String(item.id), item])), [session.items]);
  const current = session.order[position];
  const item = current ? items.get(String(current.id)) : undefined;
  const previous = session.answers[String(position)];
  const answered = Object.keys(session.answers).length;

  const moveTo = useCallback((next: number, state = session) => {
    setPosition(next);
    setUnsure(state.answers[String(next)]?.unsure ?? false);
    setNote(state.answers[String(next)]?.note ?? '');
    setError('');
    shownAt.current = Date.now();
    requestAnimationFrame(() => questionTop.current?.scrollIntoView?.({ block: 'start' }));
  }, [session]);

  const answer = useCallback(async (label: AnnotationLabel) => {
    if (lock.current || conflict || !current || pilot) return;
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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '儲存失敗，請再選一次答案重試。');
      if (reason instanceof AnnotationApiError && reason.status === 409) setConflict(true);
    } finally {
      lock.current = false;
      setSaving(false);
      onBusy(false);
    }
  }, [conflict, current, moveTo, note, onBusy, pilot, position, previous, session, unsure]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || saving || exporting || pilot || conflict || !current) return;
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
  }, [answer, conflict, current, exporting, health, moveTo, pilot, position, saving]);

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
      setError(reason instanceof Error ? reason.message : '匯出失敗，請再試一次。');
    } finally { setExporting(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{session.title}</h2>
          <p className="text-sm text-muted-foreground">標註者：{session.annotator}（目前登入帳號）</p>
        </div>
        <Button variant="outline" disabled={saving || exporting} onClick={() => void download()}>
          <DownloadIcon />{exporting ? '匯出中…' : '匯出我的結果'}
        </Button>
      </div>
      <div aria-live="polite" className="space-y-2">
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <span>{current ? `第 ${position + 1} / ${session.order.length} 題` : '這組題目已完成'} · 已標 {answered} 題</span>
          <span className="inline-flex items-center gap-1 text-primary" role="status">
            <CheckCircle2Icon className="size-4" />{saving ? '儲存中…' : '已儲存的答案會保留在帳號中'}
          </span>
        </div>
        <progress className="h-2 w-full accent-primary" aria-label="標註進度" max={session.order.length} value={answered} />
      </div>
      <Rules health={health} />
      {error && <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
        <p>{error}</p>
        <p className="mt-1 text-sm">目前這題的選項與備註尚未儲存。</p>
        {conflict && <Button className="mt-3" variant="outline" onClick={reload}>重新載入進度</Button>}
      </div>}
      {pilot && <div role="dialog" aria-label="試標完成" className="rounded-xl border border-primary/40 bg-primary/5 p-5">
        <h3 className="font-bold">試標 {session.pilot} 題完成</h3>
        <p className="mt-2">進度已儲存。可以先匯出結果檢查一致性，再繼續標註。</p>
        <Button className="mt-3" onClick={() => setPilot(false)}>繼續標註</Button>
      </div>}
      <div ref={questionTop} className="scroll-mt-24" />
      {item ? <>
        {previous && <p className="text-sm text-muted-foreground">這題已標過，可以修改後重新選擇答案。</p>}
        {health ? <Card><CardContent className="whitespace-pre-wrap break-words text-lg leading-relaxed">{item.t}</CardContent></Card>
          : <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardContent><p className="mb-3 text-sm text-muted-foreground">使用者的說法</p><p className="whitespace-pre-wrap break-words text-lg leading-relaxed">{item.u}</p></CardContent></Card>
            <Card><CardContent><p className="mb-3 text-sm text-muted-foreground">查核報告在查的</p><p className="whitespace-pre-wrap break-words text-lg leading-relaxed">{item.r}</p></CardContent></Card>
          </div>}
        <fieldset disabled={saving || conflict || pilot || exporting} className="space-y-4">
          <legend className="sr-only">本題標註</legend>
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <input className="size-5 accent-primary" type="checkbox" checked={unsure} onChange={event => setUnsure(event.target.checked)} />
            拿不準（U）
          </label>
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="annotation-note">備註（選填）</label>
            <Textarea id="annotation-note" maxLength={2000} value={note} onChange={event => setNote(event.target.value)} placeholder="拿不準的原因、看不懂的地方" />
          </div>
          <p className="text-sm text-muted-foreground">選擇答案即儲存並進入下一題。{health ? '不用判斷真假，也不用查資料。' : '先找出傳言，再比對主角與效果。'}</p>
          <div className={`grid gap-3 ${health ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            <Button size="lg" variant="outline" aria-pressed={previous?.label === 0} onClick={() => void answer(0)}>{health ? '無關' : '不同主張'}（F）</Button>
            {health && <Button size="lg" variant="outline" aria-pressed={!!previous && previous.label === null} onClick={() => void answer(null)}>無法判斷（N）</Button>}
            <Button size="lg" aria-pressed={previous?.label === 1} onClick={() => void answer(1)}>{health ? '健康相關' : '同一主張'}（J）</Button>
          </div>
        </fieldset>
      </> : <Card><CardContent className="space-y-3">
        <h3 className="text-xl font-bold">標完了，謝謝！</h3>
        <p>已標 {answered} 題，其中拿不準 {Object.values(session.answers).filter(value => value.unsure).length} 題。可以匯出結果或回頭檢查。</p>
      </CardContent></Card>}
      <div className="flex justify-between gap-3">
        <Button variant="outline" disabled={position === 0 || saving || pilot || conflict || exporting} onClick={() => moveTo(position - 1)}><ArrowLeftIcon />上一題</Button>
        {current && previous && <Button variant="outline" disabled={saving || pilot || conflict || exporting} onClick={() => moveTo(position + 1)}>下一題</Button>}
      </div>
      <p className="text-sm text-muted-foreground">每位標註者的題目順序不同，最後包含重測題；請照當下判斷作答。約每 30 分鐘休息一下。</p>
      {health && <p className="text-xs text-muted-foreground">本編輯資料取自「Cofacts 真的假的」訊息回報機器人與查證協作社群，採 CC BY-SA 4.0 授權提供。<a className="underline" href="https://cofacts.tw" target="_blank" rel="noreferrer">Cofacts</a></p>}
    </div>
  );
}

function Workspace({ task, onBusy }: { task: AnnotationTaskId; onBusy: (busy: boolean) => void }) {
  const query = useQuery({
    queryKey: ['admin-annotations', task],
    queryFn: ({ signal }) => fetchAnnotationSession(task, signal),
    staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  if (query.isPending) return <p role="status">載入題目與我的進度…</p>;
  if (query.isError) return <div role="alert"><p>{query.error.message}</p><Button onClick={() => void query.refetch()}>重試</Button></div>;
  return <AnnotationForm key={`${task}:${query.data.revision}`} initial={query.data} reload={() => void query.refetch()} onBusy={onBusy} />;
}

export default function AdminAnnotationsPage() {
  const [selected, setSelected] = useState<AnnotationTaskId | null>(null);
  const [busy, setBusy] = useState(false);
  const tasks = useQuery({ queryKey: ['admin-annotation-tasks'], queryFn: fetchAnnotationTasks });
  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-8">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-primary/10 p-3 text-primary"><TagsIcon className="size-6" /></span>
        <div><p className="text-sm font-medium text-primary">管理員工具</p><h1 className="text-2xl font-bold">標記頁面</h1><p className="mt-2 text-muted-foreground">直接使用登入帳號標註，不需填姓名。每個人的答案分開保存，可以隨時回來繼續。</p></div>
      </div>
      {selected ? <>
        <Button variant="ghost" disabled={busy} onClick={() => setSelected(null)}><ArrowLeftIcon />返回題組</Button>
        <Workspace key={selected} task={selected} onBusy={setBusy} />
      </> : <>
        {tasks.isPending && <p role="status">載入標註題組…</p>}
        {tasks.isError && <div role="alert"><p>{tasks.error.message}</p><Button onClick={() => void tasks.refetch()}>重試</Button></div>}
        <div className="grid gap-4 sm:grid-cols-2">
          {tasks.data?.map(task => <Card key={task.id}><CardContent className="flex h-full flex-col gap-4">
            <h2 className="text-xl font-bold">{task.title}</h2><p className="text-muted-foreground">{task.description}</p>
            <p className="text-sm">{task.question_count.toLocaleString()} 題＋{task.total_count - task.question_count} 題重測</p>
            <Button className="mt-auto" onClick={() => setSelected(task.id)}>開始／繼續{task.title}</Button>
          </CardContent></Card>)}
        </div>
      </>}
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGetMe } from '@workspace/api-client-react';
import {
  CheckSquare, Plus, Loader2, ChevronRight, Circle,
  Clock, AlertCircle, CheckCircle2, RotateCcw, Ban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ErrorState, LoadingState } from '@/components/design/system';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

interface TaskWithProject {
  id: string; code: string; title: string;
  status: string; priority: string;
  projectId: string; projectName: string; projectCode: string;
  dueAt: string | null; assigneeId: string | null;
  createdAt: string;
}

interface Project { id: string; name: string; code: string; status: string; }

const STATUS_ORDER = ['todo', 'in_progress', 'review', 'blocked', 'done'];

const STATUS_META: Record<string, { icon: React.ElementType; color: string; ring: string }> = {
  todo:        { icon: Circle,        color: 'text-muted-foreground', ring: 'border-muted-foreground/40' },
  in_progress: { icon: RotateCcw,     color: 'text-blue-500',         ring: 'border-blue-400' },
  review:      { icon: Clock,         color: 'text-amber-500',         ring: 'border-amber-400' },
  blocked:     { icon: Ban,           color: 'text-rose-500',          ring: 'border-rose-400' },
  done:        { icon: CheckCircle2,  color: 'text-emerald-500',       ring: 'border-emerald-400' },
};

const PRIORITY_DOT: Record<string, string> = {
  low:    'bg-slate-300',
  normal: 'bg-blue-400',
  high:   'bg-amber-400',
  urgent: 'bg-rose-500',
};

function StatusCycleButton({ task, onUpdate }: { task: TaskWithProject; onUpdate: (id: string, status: string) => void }) {
  const meta = STATUS_META[task.status] ?? STATUS_META.todo;
  const Icon = meta.icon;
  const next = STATUS_ORDER[(STATUS_ORDER.indexOf(task.status) + 1) % STATUS_ORDER.length];
  return (
    <button
      onClick={() => onUpdate(task.id, next)}
      title={`Переключити на: ${next}`}
      className={cn(
        'h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors hover:bg-accent',
        meta.ring
      )}
    >
      <Icon className={cn('h-3 w-3', meta.color)} />
    </button>
  );
}

function isOverdue(dueAt: string | null) {
  if (!dueAt) return false;
  return new Date(dueAt) < new Date();
}

function formatDue(
  dueAt: string | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
  language: string,
) {
  if (!dueAt) return null;
  const d = new Date(dueAt);
  const today = new Date();
  const diff = Math.ceil((d.getTime() - today.setHours(0,0,0,0)) / 86_400_000);
  if (diff === 0) return t('tasks:today');
  if (diff === 1) return t('tasks:tomorrow');
  if (diff === -1) return t('tasks:yesterday');
  if (diff < 0) return t('tasks:daysAgo', { count: Math.abs(diff) });
  const locale = language === 'cs' ? 'cs-CZ' : 'uk-UA';
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

export default function TasksPage() {
  const { t, i18n } = useTranslation(['tasks', 'common']);
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newDue, setNewDue] = useState('');
  const [createError, setCreateError] = useState('');

  const [statusFilter, setStatusFilter] = useState<string>('active'); // 'active' | 'done' | 'all'

  const { data, isLoading, isError, refetch } = useQuery<{ tasks: TaskWithProject[] }>({
    queryKey: ['my-tasks', me?.id],
    queryFn: () => apiFetch(`/api/tasks?assigneeId=${me!.id}&limit=100`),
    enabled: !!me?.id,
    staleTime: 30_000,
  });

  const { data: projectsData } = useQuery<{ projects: Project[] }>({
    queryKey: ['projects'],
    queryFn: () => apiFetch('/api/projects'),
    staleTime: 60_000,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/api/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['home-tasks'] });
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: { title: string; priority: string; assigneeId: string; dueAt?: string }) =>
      apiFetch(`/api/projects/${newProjectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['home-tasks'] });
      setDialogOpen(false);
      setNewTitle(''); setNewProjectId(''); setNewPriority('medium'); setNewDue(''); setCreateError('');
    },
    onError: (err: Error) => setCreateError(err.message),
  });

  const openCreate = () => {
    setNewTitle(''); setNewPriority('medium'); setNewDue(''); setCreateError('');
    const projects = projectsData?.projects ?? [];
    if (projects.length === 1) setNewProjectId(projects[0].id);
    else setNewProjectId('');
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newProjectId || !me) return;
    // Convert date-only (YYYY-MM-DD) to full ISO datetime so backend schema validation passes
    const dueAtIso = newDue ? new Date(newDue + 'T23:59:59').toISOString() : undefined;
    createMutation.mutate({
      title: newTitle.trim(),
      priority: newPriority,
      assigneeId: me.id,
      dueAt: dueAtIso,
    });
  };

  const allTasks = data?.tasks ?? [];
  const projects = projectsData?.projects ?? [];

  const filtered = allTasks.filter(t => {
    if (statusFilter === 'active') return t.status !== 'done';
    if (statusFilter === 'done')   return t.status === 'done';
    return true;
  });

  // Group by status in order
  const grouped = STATUS_ORDER.reduce<Record<string, TaskWithProject[]>>((acc, s) => {
    const group = filtered.filter(t => t.status === s);
    if (group.length > 0) acc[s] = group;
    return acc;
  }, {});

  const activeCnt  = allTasks.filter(t => t.status !== 'done').length;
  const doneCnt    = allTasks.filter(t => t.status === 'done').length;
  const overdueCnt = allTasks.filter(t => t.status !== 'done' && isOverdue(t.dueAt)).length;

  const statusLabel: Record<string, string> = {
    todo:        t('tasks:status.todo'),
    in_progress: t('tasks:status.in_progress'),
    review:      t('tasks:status.review'),
    blocked:     t('tasks:status.blocked'),
    done:        t('tasks:status.done'),
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b bg-background/95 px-5 py-5 backdrop-blur md:px-8 lg:px-10">
        <div className="flex items-center gap-3">
          <CheckSquare className="h-6 w-6 text-primary shrink-0" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground" data-testid="text-page-title">
              {t('tasks:myTasks')}
            </h1>
            <p className="text-sm text-muted-foreground">{t('tasks:subtitle')}</p>
          </div>
          <div className="ml-auto">
            <Button onClick={openCreate} className="gap-2" disabled={projects.length === 0}>
              <Plus className="h-4 w-4" />{t('tasks:new')}
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 mt-4 text-sm">
          <button
            onClick={() => setStatusFilter('active')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors',
              statusFilter === 'active' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent')}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            <span>{t('common:tasks.active', { defaultValue: 'Активні' })}</span>
            <span className="font-bold tabular-nums">{activeCnt}</span>
          </button>
          <button
            onClick={() => setStatusFilter('done')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors',
              statusFilter === 'done' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent')}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{t('tasks:status.done')}</span>
            <span className="font-bold tabular-nums">{doneCnt}</span>
          </button>
          <button
            onClick={() => setStatusFilter('all')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors',
              statusFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent')}
          >
            {t('common:tasks.all', { defaultValue: 'Всі' })}
            <span className="font-bold tabular-nums">{allTasks.length}</span>
          </button>
          {overdueCnt > 0 && (
            <span className="flex items-center gap-1 text-rose-600 font-medium ml-auto">
              <AlertCircle className="h-3.5 w-3.5" />
              {t('tasks:overdueCount', { count: overdueCnt })}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 md:px-10 py-6">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={t('common:status.error')} onRetry={() => void refetch()} />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 opacity-60" />
            <p className="text-muted-foreground text-sm">
              {statusFilter === 'done'
                ? t('common:tasks.noDone', { defaultValue: 'Завершених завдань ще немає' })
                : t('tasks:noTasks')}
            </p>
            {statusFilter !== 'done' && (
              <Button variant="outline" size="sm" onClick={openCreate} disabled={projects.length === 0}>
                <Plus className="h-4 w-4 mr-2" />{t('tasks:new')}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([status, tasks]) => {
              const meta = STATUS_META[status] ?? STATUS_META.todo;
              const Icon = meta.icon;
              return (
                <section key={status}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={cn('h-4 w-4', meta.color)} />
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {statusLabel[status] ?? status}
                    </h2>
                    <span className="text-xs text-muted-foreground">({tasks.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {tasks.map(task => {
                      const due = formatDue(task.dueAt, t, i18n.language);
                      const overdue = isOverdue(task.dueAt) && task.status !== 'done';
                      return (
                        <div key={task.id}
                          className="group flex items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:shadow-sm transition-shadow">
                          <StatusCycleButton task={task} onUpdate={(id, s) => updateStatusMutation.mutate({ id, status: s })} />
                          <div
                            className={cn('h-2 w-2 rounded-full shrink-0', PRIORITY_DOT[task.priority] ?? 'bg-slate-300')}
                            title={t(`tasks:priority.${task.priority}`, { defaultValue: task.priority })}
                          />
                          <div className="flex-1 min-w-0">
                            <Link href={`/tasks/${task.id}`} className="hover:underline">
                              <span className={cn('text-sm font-medium text-foreground', task.status === 'done' && 'line-through text-muted-foreground')}>
                                {task.title}
                              </span>
                            </Link>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                              <span className="font-mono">{task.projectCode}-{task.code}</span>
                              <span>·</span>
                              <Link href={`/projects/${task.projectId}`} className="hover:text-primary truncate max-w-[200px]">
                                {task.projectName}
                              </Link>
                            </div>
                          </div>
                          {due && (
                            <span className={cn('text-xs shrink-0 font-medium', overdue ? 'text-rose-500' : 'text-muted-foreground')}>
                              {overdue && <AlertCircle className="h-3 w-3 inline mr-0.5" />}
                              {due}
                            </span>
                          )}
                          <Link href={`/tasks/${task.id}`}
                            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('tasks:new')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('tasks:fields.title', { defaultValue: 'Назва' })}</Label>
              <Input
                value={newTitle} onChange={e => setNewTitle(e.target.value)}
                placeholder="Назва завдання…" autoFocus required />
            </div>
            <div className="space-y-2">
              <Label>{t('common:project', { defaultValue: 'Проєкт' })}</Label>
              <select
                value={newProjectId} onChange={e => setNewProjectId(e.target.value)}
                required
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">{t('tasks:selectProject')}</option>
                {projects.filter(p => p.status === 'active').map(p => (
                  <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('tasks:fields.priority', { defaultValue: 'Пріоритет' })}</Label>
                <select
                  value={newPriority} onChange={e => setNewPriority(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  {['low','medium','high','critical'].map(p => (
                    <option key={p} value={p}>{t(`tasks:priority.${p}`, { defaultValue: p })}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t('tasks:fields.dueDate', { defaultValue: 'Термін' })}</Label>
                <Input type="date" value={newDue} onChange={e => setNewDue(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('tasks:autoAssigned')}
            </p>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit" disabled={createMutation.isPending || !newTitle.trim() || !newProjectId}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {t('common:actions.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Loader2, Plus, CheckSquare2, Square, Trash2, CalendarIcon, X,
  Pencil, Check, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/components/confirm-provider';
import { CommentThread } from '@/components/comment-thread';
import { FilePanel } from '@/components/file-panel';
import { filesEnabled } from '@/lib/features';
import { DueDateChip, priorityBorderClass } from '@/components/due-date-chip';
import { useToast } from '@/hooks/use-toast';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? res.statusText);
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as unknown as T;
  }
  return res.json();
}

interface Task {
  id: string; projectId: string; code: string; title: string; status: string;
  priority: string; descriptionMd: string | null; dueAt: string | null;
  assigneeId: string | null; stageId: string | null; parentTaskId: string | null; depth: number; createdAt: string;
  pendingDeletion: { id: string; requestedById: string } | null;
}
interface ProjectMember {
  id: string; userId: string; role: string; userDisplayName: string; userEmail: string;
}
interface Stage { id: string; name: string; color: string | null; }
interface ChecklistItem {
  id: string; taskId: string; title: string; position: number; completedAt: string | null;
}

const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'review', 'done'] as const;
const STATUS_BADGE: Record<string, string> = {
  todo: 'bg-slate-500/20 text-slate-400',
  in_progress: 'bg-blue-500/20 text-blue-400',
  blocked: 'bg-red-500/20 text-red-400',
  review: 'bg-amber-500/20 text-amber-400',
  done: 'bg-emerald-500/20 text-emerald-400',
};
const PRIORITY_BADGE: Record<string, string> = {
  low: 'text-slate-400',
  medium: 'text-blue-400',
  high: 'text-orange-400',
  critical: 'text-red-400',
};

interface Props { params: { id: string } }

export default function TaskDetailPage({ params }: Props) {
  const taskId = params.id;
  const { t } = useTranslation(['tasks', 'common']);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [newItem, setNewItem] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [editTaskOpen, setEditTaskOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const { data: task, isLoading } = useQuery<Task>({
    queryKey: ['task', taskId],
    queryFn: () => apiFetch(`/api/tasks/${taskId}`),
  });

  const { data: me } = useQuery<{ id: string; role: string }>({
    queryKey: ['me'],
    queryFn: () => apiFetch('/api/auth/me'),
    staleTime: 60_000,
  });
  const isAdmin = me?.role === 'admin';

  const { data: checklistData } = useQuery<{ items: ChecklistItem[] }>({
    queryKey: ['task-checklist', taskId],
    queryFn: () => apiFetch(`/api/tasks/${taskId}/checklist`),
  });

  const { data: subtasksData } = useQuery<{ tasks: Task[] }>({
    queryKey: ['task-subtasks', taskId],
    queryFn: () => apiFetch(`/api/projects/${task?.projectId}/tasks?parentTaskId=${taskId}`),
    enabled: !!task?.projectId,
  });

  const { data: membersData } = useQuery<{ members: ProjectMember[] }>({
    queryKey: ['project-members', task?.projectId],
    queryFn: () => apiFetch(`/api/projects/${task!.projectId}/members`),
    enabled: !!task?.projectId,
  });

  const { data: stagesData } = useQuery<{ stages: Stage[] }>({
    queryKey: ['project-stages', task?.projectId],
    queryFn: () => apiFetch(`/api/projects/${task!.projectId}/stages`),
    enabled: !!task?.projectId,
  });

  const updateStageMutation = useMutation({
    mutationFn: (stageId: string | null) =>
      apiFetch<Task>(`/api/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ stageId }) }),
    onSuccess: (updated) => queryClient.setQueryData(['task', taskId], updated),
  });

  const updateAssigneeMutation = useMutation({
    mutationFn: (assigneeId: string | null) =>
      apiFetch<Task>(`/api/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ assigneeId }) }),
    onSuccess: (updated) => queryClient.setQueryData(['task', taskId], updated),
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) =>
      apiFetch<Task>(`/api/tasks/${taskId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task', taskId] }),
  });

  const updateDueDateMutation = useMutation({
    mutationFn: (dueAt: string | null) =>
      apiFetch<Task>(`/api/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ dueAt }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      setDueDateOpen(false);
    },
  });

  const addChecklistMutation = useMutation({
    mutationFn: (title: string) =>
      apiFetch<ChecklistItem>(`/api/tasks/${taskId}/checklist`, { method: 'POST', body: JSON.stringify({ title }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-checklist', taskId] });
      setNewItem(''); setAddingItem(false);
    },
  });

  const toggleChecklistMutation = useMutation({
    mutationFn: (itemId: string) =>
      apiFetch<ChecklistItem>(`/api/checklist/${itemId}/toggle`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task-checklist', taskId] }),
  });

  const deleteChecklistMutation = useMutation({
    mutationFn: (itemId: string) =>
      apiFetch(`/api/checklist/${itemId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task-checklist', taskId] }),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: () => apiFetch<{ status?: string } | undefined>(`/api/tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: (result) => {
      if (result?.status === 'pending') {
        toast({ title: t('tasks:deleteRequested') });
        queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      } else {
        window.history.back();
      }
    },
    onError: (err: Error) => {
      toast({ title: t('tasks:deleteFailed'), description: err.message, variant: 'destructive' });
    },
  });

  const approveDeleteMutation = useMutation({
    mutationFn: (requestId: string) => apiFetch(`/api/deletion-requests/${requestId}/approve`, { method: 'POST' }),
    onSuccess: () => window.history.back(),
    onError: (err: Error) => toast({ title: t('tasks:deleteFailed'), description: err.message, variant: 'destructive' }),
  });

  const rejectDeleteMutation = useMutation({
    mutationFn: (requestId: string) => apiFetch(`/api/deletion-requests/${requestId}/reject`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task', taskId] }),
    onError: (err: Error) => toast({ title: t('tasks:deleteFailed'), description: err.message, variant: 'destructive' }),
  });

  const updateTaskMutation = useMutation({
    mutationFn: (payload: { title: string; descriptionMd: string | null }) =>
      apiFetch<Task>(`/api/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['task', taskId], updated);
      setEditTaskOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: t('common:status.error'), description: err.message, variant: 'destructive' });
    },
  });

  function openEditTask() {
    if (!task) return;
    setEditTitle(task.title);
    setEditDescription(task.descriptionMd ?? '');
    setEditTaskOpen(true);
  }

  const items = checklistData?.items ?? [];
  const subtasks = subtasksData?.tasks ?? [];
  const completedCount = items.filter(i => i.completedAt).length;

  if (isLoading) return (
    <div className="flex items-center justify-center h-60">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (!task) return <div className="flex-1 p-6"><p className="text-muted-foreground">{t('notFound')}</p></div>;

  return (
    <div className="flex-1 p-6 md:p-10 space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href={`/projects/${task.projectId}`}>
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </Link>
        <span className="font-mono text-xs text-muted-foreground">{task.code}</span>
        <div className="flex-1" />
        {task.pendingDeletion && (
          <span className="flex items-center gap-1 text-xs font-medium text-amber-500">
            <AlertTriangle className="h-3.5 w-3.5" />{t('tasks:pendingDeletion')}
          </span>
        )}
        {task.pendingDeletion && isAdmin ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="text-emerald-600 hover:text-emerald-600 hover:bg-emerald-500/10"
              onClick={() => approveDeleteMutation.mutate(task.pendingDeletion!.id)}
              disabled={approveDeleteMutation.isPending}
            >
              {approveDeleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => rejectDeleteMutation.mutate(task.pendingDeletion!.id)}
              disabled={rejectDeleteMutation.isPending}
            >
              {rejectDeleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={openEditTask}
              title={t('tasks:editTask')}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            {!task.pendingDeletion && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => { void confirm({ title: t('tasks:confirmDelete') }).then((accepted) => { if (accepted) deleteTaskMutation.mutate(); }); }}
                disabled={deleteTaskMutation.isPending}
              >
                {deleteTaskMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            )}
          </>
        )}
      </div>

      {/* Task card with priority left-border accent */}
      <div className={cn(
        'rounded-lg border bg-card p-5 border-l-4 space-y-3',
        priorityBorderClass(task.priority),
      )}>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{task.title}</h1>
        <div className="flex flex-wrap items-center gap-3">
          {/* Status select */}
          <Select value={task.status} onValueChange={(s) => updateStatusMutation.mutate(s)}>
            <SelectTrigger className={cn('h-8 w-36 text-xs', STATUS_BADGE[task.status])}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_STATUSES.map(s => (
                <SelectItem key={s} value={s} className="text-xs">
                  {t(`status.${s}`, {defaultValue: s.replace('_', ' ')})}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Priority badge */}
          <span className={cn('text-xs capitalize font-medium', PRIORITY_BADGE[task.priority])}>
            {t(`priority.${task.priority}`, {defaultValue: task.priority})}
          </span>

          {/* Due date picker */}
          <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  'flex items-center gap-1.5 text-xs rounded-md px-2 py-1 border transition-colors',
                  task.dueAt
                    ? 'border-transparent bg-transparent p-0 hover:opacity-80'
                    : 'border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-primary',
                )}
              >
                {task.dueAt ? (
                  <DueDateChip dueAt={task.dueAt} />
                ) : (
                  <>
                    <CalendarIcon className="h-3 w-3" />
                    {t('fields.dueDate')}
                  </>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={task.dueAt ? new Date(task.dueAt) : undefined}
                onSelect={(date) => {
                  updateDueDateMutation.mutate(date ? date.toISOString() : null);
                }}
                initialFocus
              />
              {task.dueAt && (
                <div className="p-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-muted-foreground gap-1"
                    onClick={() => updateDueDateMutation.mutate(null)}
                  >
                    <X className="h-3 w-3" />
                    {t('tasks:clearDate')}
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {task.descriptionMd && (
          <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
            {task.descriptionMd}
          </pre>
        )}
      </div>

      {/* Checklist */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            {t('tasks:fields.checklist')} {items.length > 0 && <span className="text-muted-foreground font-normal">({completedCount}/{items.length})</span>}
          </h2>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setAddingItem(true)}>
            <Plus className="h-3 w-3" />{t('tasks:addItem')}
          </Button>
        </div>
        {items.length > 0 && (
          <div className="w-full bg-secondary rounded-full h-1.5">
            <div className="bg-primary rounded-full h-1.5 transition-all" style={{ width: `${items.length > 0 ? (completedCount / items.length) * 100 : 0}%` }} />
          </div>

        )}
        {/* Assignee */}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground shrink-0">{t('tasks:fields.assignee', {defaultValue: 'Виконавець'})}:</span>
          <select
            value={task.assigneeId ?? ''}
            onChange={e => updateAssigneeMutation.mutate(e.target.value || null)}
            className="text-xs border rounded-md px-2 py-1 bg-background h-7 max-w-[200px]"
          >
            <option value="">{t('tasks:fields.noAssignee', {defaultValue: '— без виконавця —'})}</option>
            {(membersData?.members ?? []).map(m => (
              <option key={m.userId} value={m.userId}>{m.userDisplayName}</option>
            ))}
          </select>
          {updateAssigneeMutation.isPending && (
            <span className="text-xs text-muted-foreground">…</span>
          )}
        </div>

        {/* Stage */}
        {(stagesData?.stages ?? []).length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">{t('tasks:fields.stage', {defaultValue: 'Стадія'})}:</span>
            <select
              value={task.stageId ?? ''}
              onChange={e => updateStageMutation.mutate(e.target.value || null)}
              className="text-xs border rounded-md px-2 py-1 bg-background h-7 max-w-[200px]"
            >
              <option value="">{t('projects:noStage', {defaultValue: '— без стадії —'})}</option>
              {(stagesData?.stages ?? []).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {updateStageMutation.isPending && (
              <span className="text-xs text-muted-foreground">…</span>
            )}
          </div>
        )}
        <div className="space-y-1">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-2 group">
              <button onClick={() => toggleChecklistMutation.mutate(item.id)} className="shrink-0">
                {item.completedAt ? (
                  <CheckSquare2 className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Square className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              <span className={cn('flex-1 text-sm', item.completedAt && 'line-through text-muted-foreground')}>
                {item.title}
              </span>
              <button
                onClick={() => deleteChecklistMutation.mutate(item.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {addingItem && (
            <form onSubmit={(e) => { e.preventDefault(); if (newItem.trim()) addChecklistMutation.mutate(newItem.trim()); }} className="flex items-center gap-2">
              <Square className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input className="h-7 text-sm flex-1" value={newItem} onChange={(e) => setNewItem(e.target.value)}
                placeholder={t('tasks:itemPlaceholder')} autoFocus onBlur={() => { if (!newItem.trim()) setAddingItem(false); }} />
              <Button type="submit" size="sm" className="h-7 text-xs" disabled={!newItem.trim()}>{t('tasks:addItem')}</Button>
            </form>
          )}
        </div>
      </div>

      {/* Subtasks */}
      {subtasks.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">{t('tasks:subtasks')}</h2>
          <div className="space-y-1">
            {subtasks.map(st => (
              <Link key={st.id} href={`/tasks/${st.id}`}>
                <div className={cn(
                  'flex items-center gap-2 rounded-md border bg-card px-3 py-2 hover:bg-accent/40 cursor-pointer border-l-4',
                  priorityBorderClass(st.priority),
                )}>
                  <span className="font-mono text-xs text-muted-foreground">{st.code}</span>
                  <span className="flex-1 text-sm">{st.title}</span>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full', STATUS_BADGE[st.status])}>
                    {t(`status.${st.status}`, {defaultValue: st.status})}
                  </span>
                  {st.dueAt && <DueDateChip dueAt={st.dueAt} />}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Files */}
      {task && (
        <div className="rounded-xl border bg-card p-5">
          {filesEnabled ? <FilePanel entityType="task" entityId={task.id} /> : null}
        </div>
      )}

      {/* Comments */}
      {task && (
        <div className="rounded-xl border bg-card p-5">
          <CommentThread entityType="task" entityId={task.id} />
        </div>
      )}

      {/* Edit title/description dialog */}
      <Dialog open={editTaskOpen} onOpenChange={setEditTaskOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t('tasks:editTask')}</DialogTitle></DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editTitle.trim()) return;
              updateTaskMutation.mutate({ title: editTitle.trim(), descriptionMd: editDescription.trim() || null });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="edit-task-title">{t('tasks:fields.title')}</Label>
              <Input id="edit-task-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} autoFocus required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-task-description">{t('tasks:fields.description')}</Label>
              <Textarea
                id="edit-task-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={6}
                className="text-sm resize-none"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTaskOpen(false)}>{t('common:actions.cancel')}</Button>
              <Button type="submit" disabled={updateTaskMutation.isPending || !editTitle.trim()}>
                {updateTaskMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}{t('common:actions.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

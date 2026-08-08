import { useState } from 'react';
    import { Link, useLocation } from 'wouter';
    import { useTranslation } from 'react-i18next';
    import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
    import {
    ArrowLeft, Plus, BookOpen, Loader2, CheckSquare, Users,
    Flag, Calendar, ChevronDown, ChevronUp, Layers, Trash2, UserPlus, X, Pencil,
    GitBranch, ArrowUpRight, StickyNote, Archive as ArchiveIcon,
    AlertTriangle, Check,
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
    import {
    Tabs, TabsList, TabsTrigger, TabsContent,
    } from '@/components/ui/tabs';
    import { cn } from '@/lib/utils';
    import { CommentThread } from '@/components/comment-thread';
    import { FilePanel } from '@/components/file-panel';
    import { KanbanBoard, type KanbanTask } from '@/components/kanban-board';
    import { DueDateChip, priorityBorderClass } from '@/components/due-date-chip';
    import { AvatarBadge } from '@/components/ui/avatar-badge';
    import { useToast } from '@/hooks/use-toast';
    import { filesEnabled } from '@/lib/features';
    import { appLocale } from '@/lib/locale';
    import { useConfirm } from '@/components/confirm-provider';

    const PROJECT_ICONS = [
    '📁','📂','🏗️','💡','🔧','🎯','🚀','🌐',
    '📊','📱','🔬','🏢','🎨','📝','🔒','🌱',
    '⚡','🤝','🛠️','💼','🧪','📐','🗂️','🏆',
    ];

    function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {PROJECT_ICONS.map(emoji => (
          <button
            key={emoji}
            type="button"
            onClick={() => onChange(emoji)}
            className={cn(
              'h-9 w-9 flex items-center justify-center rounded-md text-xl border transition-all',
              value === emoji
                ? 'border-primary bg-primary/10 shadow-sm scale-110'
                : 'border-transparent hover:border-muted-foreground/30 hover:bg-accent',
            )}
          >
            {emoji}
          </button>
        ))}
      </div>
    );
    }

    function InfoBlockForm({
    initialTitle, initialBody, saving, onSave, onCancel,
    }: {
    initialTitle: string; initialBody: string; saving: boolean;
    onSave: (title: string, body: string) => void; onCancel: () => void;
    }) {
    const { t } = useTranslation('projects');
    const [title, setTitle] = useState(initialTitle);
    const [body, setBody] = useState(initialBody);
    return (
      <form
        className="rounded-lg border bg-card p-4 space-y-3"
        onSubmit={(e) => { e.preventDefault(); if (title.trim()) onSave(title.trim(), body.trim()); }}
      >
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('info.titlePlaceholder', { defaultValue: 'Напр. Адреса об’єкта' })}
          autoFocus
          required
        />
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('info.bodyPlaceholder', { defaultValue: 'Детальна інформація…' })}
          rows={4}
          className="text-sm resize-none"
        />
        <div className="flex gap-2 justify-end">
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>{t('actions.cancel', { ns: 'common' })}</Button>
          <Button type="submit" size="sm" disabled={!title.trim() || saving}>
            {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}{t('actions.save', { ns: 'common' })}
          </Button>
        </div>
      </form>
    );
    }

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

    interface Project {
    id: string; code: string; name: string; icon: string; status: string;
    summary: string | null; descriptionMd: string | null;
    clientName: string | null; clientId: string | null; ownerId: string;
    startsOn: string | null; dueOn: string | null; totalHours: number | null;
    kind: string | null; depth: number; parentId: string | null;
    }
    interface ProjectSummary { id: string; code: string; name: string; icon: string; status: string; parentId: string | null; }
    interface Client { id: string; name: string; industry: string | null; }
    interface Stage { id: string; name: string; color: string | null; position: number; completedAt: string | null; }
    interface Task {
    id: string; code: string; title: string; status: string; priority: string;
    assigneeId: string | null; dueAt: string | null; depth: number; parentTaskId: string | null;
    stageId: string | null; projectId?: string; projectName?: string; projectCode?: string;
    pendingDeletion: { id: string; requestedById: string } | null;
    }
    interface ProjectMember { id: string; userId: string; role: string; userDisplayName: string; userEmail: string; userAvatarKey: string | null; }
    interface SystemUser { id: string; displayName: string; email: string; role: string; avatarKey: string | null; }
    interface InfoBlock { id: string; title: string; body: string; position: number; }

    const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'review', 'done'] as const;
    const STATUS_BADGE: Record<string, string> = {
    todo: 'bg-slate-500/20 text-slate-400',
    in_progress: 'bg-blue-500/20 text-blue-400',
    blocked: 'bg-red-500/20 text-red-400',
    review: 'bg-amber-500/20 text-amber-400',
    done: 'bg-emerald-500/20 text-emerald-400',
    };
    const PRIORITY_BADGE: Record<string, string> = {
    low: 'text-slate-400', medium: 'text-blue-400', high: 'text-orange-400', critical: 'text-red-400',
    };

    interface Props { params: { id: string } }

    export default function ProjectDetailPage({ params }: Props) {
    const { id: projectId } = params;
    const { t: tTask } = useTranslation('tasks');
    const { t, i18n } = useTranslation('projects');
    const locale = appLocale(i18n.language);
    const queryClient = useQueryClient();
    const [, navigate] = useLocation();
    const { toast } = useToast();
    const confirm = useConfirm();

    const [taskDialogOpen, setTaskDialogOpen] = useState(false);
    const [taskTitle, setTaskTitle] = useState('');
    const [taskPriority, setTaskPriority] = useState('medium');
    const [taskDueDate, setTaskDueDate] = useState('');
    const [taskStageId, setTaskStageId] = useState('');
    const [taskError, setTaskError] = useState('');
    const [descExpanded, setDescExpanded] = useState(false);
    const [stageDialogOpen, setStageDialogOpen] = useState(false);
    const [stageName, setStageName] = useState('');
    const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'stages' | 'timeline'>('list');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [includeSubprojects, setIncludeSubprojects] = useState(false);
    const [confirmDeleteProject, setConfirmDeleteProject] = useState(false);
    const [confirmArchiveProject, setConfirmArchiveProject] = useState(false);
    const [editingClient, setEditingClient] = useState(false);
    const [editProjectOpen, setEditProjectOpen] = useState(false);
    const [editIcon, setEditIcon] = useState('📁');
    const [editName, setEditName] = useState('');
    const [editSummary, setEditSummary] = useState('');
    const [editStatus, setEditStatus] = useState('planned');
    const [taskAssignee, setTaskAssignee] = useState('');
    const [addingMember, setAddingMember] = useState(false);
    const [newMemberUserId, setNewMemberUserId] = useState('');
    const [newMemberRole, setNewMemberRole] = useState('member');
    const [editingBlockId, setEditingBlockId] = useState<string | null>(null);

    const { data: project, isLoading: projLoading } = useQuery<Project>({
      queryKey: ['project', projectId],
      queryFn: () => apiFetch(`/api/projects/${projectId}`),
    });

    interface TaskPage {
      tasks: Task[];
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    }

    const taskQueryKey = ['project-tasks', projectId, statusFilter, includeSubprojects] as const;
    const {
      data: tasksData,
      isLoading: tasksLoading,
      fetchNextPage,
      hasNextPage,
      isFetchingNextPage,
    } = useInfiniteQuery<TaskPage>({
      queryKey: taskQueryKey,
      initialPageParam: 0,
      queryFn: ({ pageParam }) => {
        const params = new URLSearchParams();
        if (statusFilter) params.set('status', statusFilter);
        if (includeSubprojects) params.set('includeSubprojects', 'true');
        params.set('limit', '100');
        params.set('offset', String(pageParam));
        const qs = params.toString();
        return apiFetch(`/api/projects/${projectId}/tasks${qs ? `?${qs}` : ''}`);
      },
      getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.offset + lastPage.tasks.length : undefined,
    });

    const { data: stagesData } = useQuery<{ stages: Stage[] }>({
      queryKey: ['project-stages', projectId],
      queryFn: () => apiFetch(`/api/projects/${projectId}/stages`),
    });

    const { data: allProjectsData } = useQuery<{ projects: ProjectSummary[] }>({
      queryKey: ['projects'],
      queryFn: () => apiFetch('/api/projects'),
      staleTime: 60_000,
    });

    const { data: infoBlocksData } = useQuery<{ blocks: InfoBlock[] }>({
      queryKey: ['project-info-blocks', projectId],
      queryFn: () => apiFetch(`/api/projects/${projectId}/info-blocks`),
    });

    const { data: membersData } = useQuery<{ members: ProjectMember[] }>({
      queryKey: ['project-members', projectId],
      queryFn: () => apiFetch(`/api/projects/${projectId}/members`),
    });

    const { data: usersData } = useQuery<{ users: SystemUser[] }>({
      queryKey: ['users'],
      queryFn: () => apiFetch('/api/users'),
      staleTime: 60_000,
    });

    const { data: clientsData } = useQuery<{ clients: Client[] }>({
      queryKey: ['clients'],
      queryFn: () => apiFetch('/api/clients'),
      staleTime: 60_000,
    });

    const { data: me } = useQuery<{ id: string; role: string }>({
      queryKey: ['me'],
      queryFn: () => apiFetch('/api/auth/me'),
      staleTime: 60_000,
    });
    const isAdmin = me?.role === 'admin';

    const updateClientMutation = useMutation({
      mutationFn: (clientId: string | null) =>
        apiFetch<Project>(`/api/projects/${projectId}`, {
          method: 'PATCH',
          body: JSON.stringify({ clientId }),
        }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['project', projectId] });
        setEditingClient(false);
      },
    });

    const createTaskMutation = useMutation({
      mutationFn: (payload: { title: string; priority: string; assigneeId?: string; dueAt?: string; stageId?: string }) =>
        apiFetch<Task>(`/api/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(payload) }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] });
        setTaskDialogOpen(false); setTaskTitle(''); setTaskAssignee(''); setTaskDueDate(''); setTaskStageId(''); setTaskError('');
      },
      onError: (err: Error) => setTaskError(err.message),
    });

    const completeStageMutation = useMutation({
      mutationFn: (stageId: string) =>
        apiFetch(`/api/stages/${stageId}/complete`, { method: 'POST' }),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-stages', projectId] }),
    });

    const addMemberMutation = useMutation({
      mutationFn: (payload: { userId: string; role: string }) =>
        apiFetch(`/api/projects/${projectId}/members`, { method: 'POST', body: JSON.stringify(payload) }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['project-members', projectId] });
        setAddingMember(false); setNewMemberUserId(''); setNewMemberRole('member');
      },
    });

    const removeMemberMutation = useMutation({
      mutationFn: (userId: string) =>
        apiFetch(`/api/projects/${projectId}/members/${userId}`, { method: 'DELETE' }),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-members', projectId] }),
    });

    const updateStatusMutation = useMutation({
      mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
        apiFetch<Task>(`/api/tasks/${taskId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
      onMutate: async ({ taskId, status }) => {
        const key = taskQueryKey;
        await queryClient.cancelQueries({ queryKey: ['project-tasks', projectId] });
        const prev = queryClient.getQueryData<{ pages: TaskPage[]; pageParams: number[] }>(key);
        queryClient.setQueryData<{ pages: TaskPage[]; pageParams: number[] }>(key, old =>
          old ? { ...old, pages: old.pages.map(page => ({ ...page, tasks: page.tasks.map(t => t.id === taskId ? { ...t, status } : t) })) } : old
        );
        return { prev, key };
      },
      onError: (_e, _v, ctx) => {
        if (ctx?.prev) queryClient.setQueryData(ctx.key, ctx.prev);
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] }),
    });

    const createStageMutation = useMutation({
      mutationFn: (payload: { name: string }) =>
        apiFetch<Stage>(`/api/projects/${projectId}/stages`, { method: 'POST', body: JSON.stringify(payload) }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['project-stages', projectId] });
        setStageDialogOpen(false); setStageName('');
      },
    });

    const deleteStageMutation = useMutation({
      mutationFn: (stageId: string) =>
        apiFetch(`/api/stages/${stageId}`, { method: 'DELETE' }),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-stages', projectId] }),
    });

    const infoBlocksKey = ['project-info-blocks', projectId];

    const createInfoBlockMutation = useMutation({
      mutationFn: (payload: { title: string; body: string }) =>
        apiFetch<InfoBlock>(`/api/projects/${projectId}/info-blocks`, { method: 'POST', body: JSON.stringify(payload) }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: infoBlocksKey });
        setEditingBlockId(null);
      },
    });

    const updateInfoBlockMutation = useMutation({
      mutationFn: ({ id, title, body }: { id: string; title: string; body: string }) =>
        apiFetch<InfoBlock>(`/api/info-blocks/${id}`, { method: 'PATCH', body: JSON.stringify({ title, body }) }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: infoBlocksKey });
        setEditingBlockId(null);
      },
    });

    const deleteInfoBlockMutation = useMutation({
      mutationFn: (id: string) => apiFetch(`/api/info-blocks/${id}`, { method: 'DELETE' }),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: infoBlocksKey }),
    });

    const deleteTaskMutation = useMutation({
      mutationFn: (taskId: string) =>
        apiFetch<{ status?: string } | undefined>(`/api/tasks/${taskId}`, { method: 'DELETE' }),
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] });
        if (result?.status === 'pending') {
          toast({ title: tTask('deleteRequested') });
        }
      },
      onError: (err: Error) => {
        toast({ title: tTask('deleteFailed'), description: err.message, variant: 'destructive' });
      },
    });

    const approveDeleteMutation = useMutation({
      mutationFn: (requestId: string) =>
        apiFetch(`/api/deletion-requests/${requestId}/approve`, { method: 'POST' }),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] }),
      onError: (err: Error) => toast({ title: tTask('deleteFailed'), description: err.message, variant: 'destructive' }),
    });

    const rejectDeleteMutation = useMutation({
      mutationFn: (requestId: string) =>
        apiFetch(`/api/deletion-requests/${requestId}/reject`, { method: 'POST' }),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] }),
      onError: (err: Error) => toast({ title: tTask('deleteFailed'), description: err.message, variant: 'destructive' }),
    });

    const deleteProjectMutation = useMutation({
      mutationFn: () =>
        apiFetch(`/api/projects/${projectId}`, { method: 'DELETE' }),
      onSuccess: () => navigate('/projects'),
    });

    const archiveProjectMutation = useMutation({
      mutationFn: () =>
        apiFetch(`/api/projects/${projectId}/archive`, { method: 'POST' }),
      onSuccess: () => navigate('/projects'),
    });

    const updateProjectMutation = useMutation({
      mutationFn: (payload: { name: string; icon: string; summary?: string | null; status?: string }) =>
        apiFetch<Project>(`/api/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
      onSuccess: (updated) => {
        queryClient.setQueryData(['project', projectId], updated);
        queryClient.invalidateQueries({ queryKey: ['projects'] });
        setEditProjectOpen(false);
      },
    });

    const openEditProject = () => {
      if (!project) return;
      setEditIcon(project.icon ?? '📁');
      setEditName(project.name);
      setEditSummary(project.summary ?? '');
      setEditStatus(project.status);
      setEditProjectOpen(true);
    };

    const tasks = tasksData?.pages.flatMap(page => page.tasks) ?? [];
    const stages = stagesData?.stages ?? [];
    const members = membersData?.members ?? [];
    const allUsers = usersData?.users ?? [];
    const usersMap = new Map(allUsers.map(u => [u.id, u]));
    const allProjects = allProjectsData?.projects ?? [];
    const infoBlocks = infoBlocksData?.blocks ?? [];
    const childProjects = allProjects.filter(p => p.parentId === projectId);
    const parentProject = project ? allProjects.find(p => p.id === project.parentId) : undefined;

    if (projLoading) {
      return (
        <div className="flex items-center justify-center h-60">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (!project) {
      return <div className="flex-1 p-6"><p className="text-muted-foreground">{t('notFound')}</p></div>;
    }

    const descLines = (project.descriptionMd ?? '').split('\n');
    const shouldTruncate = descLines.length > 3 || (project.descriptionMd ?? '').length > 300;
    const displayDesc = shouldTruncate && !descExpanded
      ? (project.descriptionMd ?? '').slice(0, 300) + '…'
      : project.descriptionMd;

    const stageById = new Map(stages.map(s => [s.id, s]));

    function renderTaskRow(task: Task) {
      const stage = task.stageId ? stageById.get(task.stageId) : undefined;
      const fromOtherProject = includeSubprojects && task.projectId && task.projectId !== projectId;
      return (
        <div key={task.id} style={{ marginLeft: task.depth * 20 }}>
          <div
            className={cn(
              'flex items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-accent/30 cursor-pointer border-l-4',
              priorityBorderClass(task.priority),
            )}
            data-testid={`task-row-${task.code}`}
            onClick={() => navigate(`/tasks/${task.id}`)}
          >
            <span className={cn('text-xs shrink-0', PRIORITY_BADGE[task.priority])}>
              <Flag className="h-3 w-3 inline mr-1" />{task.priority}
            </span>
            <span className="font-mono text-xs text-muted-foreground shrink-0">{task.code}</span>
            <span className="flex-1 text-sm font-medium text-foreground truncate">{task.title}</span>
            {fromOtherProject && (
              <Link href={`/projects/${task.projectId}`} onClick={(e) => e.stopPropagation()}>
                <span
                  className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground hover:underline shrink-0"
                  title={t('subprojectTask', { defaultValue: 'Задача з підпроєкту' })}
                >
                  {task.projectCode}
                </span>
              </Link>
            )}
            {stage && (
              <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground shrink-0">
                {stage.color && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />}
                {stage.name}
              </span>
            )}
            {task.assigneeId && usersMap.has(task.assigneeId) && (
              <AvatarBadge
                name={usersMap.get(task.assigneeId)!.displayName}
                avatarKey={usersMap.get(task.assigneeId)!.avatarKey}
                size="xs"
              />
            )}
            {task.dueAt && <DueDateChip dueAt={task.dueAt} />}
            {task.pendingDeletion && (
              <span
                className="flex items-center gap-1 text-xs font-medium text-amber-500 shrink-0"
                title={tTask('pendingDeletion')}
                onClick={(e) => e.stopPropagation()}
              >
                <AlertTriangle className="h-3 w-3" />
              </span>
            )}
            {task.pendingDeletion && isAdmin && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); approveDeleteMutation.mutate(task.pendingDeletion!.id); }}
                  disabled={approveDeleteMutation.isPending}
                  className="p-1 rounded text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10 shrink-0"
                  title={tTask('approve')}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); rejectDeleteMutation.mutate(task.pendingDeletion!.id); }}
                  disabled={rejectDeleteMutation.isPending}
                  className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                  title={tTask('reject')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            <Select value={task.status}
              onValueChange={(newStatus) => updateStatusMutation.mutate({ taskId: task.id, status: newStatus })}
            >
              <SelectTrigger
                className={cn('h-7 w-28 text-xs border-0 shrink-0', STATUS_BADGE[task.status])}
                data-testid={`select-task-status-${task.code}`}
                onClick={(e) => e.stopPropagation()}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">{tTask(`status.${s}` as never)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!task.pendingDeletion && (
              <button
                onClick={(e) => { e.stopPropagation(); void confirm({ title: tTask('confirmDelete') }).then((accepted) => { if (accepted) deleteTaskMutation.mutate(task.id); }); }}
                className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 p-6 md:p-10 space-y-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-start gap-4">
          <Link href="/projects">
            <button className="mt-1 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={openEditProject}
                className="text-3xl leading-none shrink-0 rounded-lg hover:bg-accent transition-colors p-1 -m-1"
                title={t('fields.editProject', { defaultValue: 'Редагувати проєкт' })}
              >{project.icon ?? '📁'}</button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono">{project.code}</span>
              {project.kind && <><span>·</span><span className="capitalize">{project.kind}</span></>}
              {editingClient ? (
                <>
                  <span>·</span>
                  <select
                    autoFocus
                    className="text-xs border rounded px-1 py-0.5 bg-background"
                    defaultValue={project.clientId ?? ''}
                    onChange={(e) => updateClientMutation.mutate(e.target.value || null)}
                    onBlur={() => setEditingClient(false)}
                  >
                    <option value="">{t('fields.client', { defaultValue: 'Client' })}: —</option>
                    {(clientsData?.clients ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </>
              ) : (
                <button
                  className="hover:text-foreground hover:underline transition-colors"
                  onClick={() => setEditingClient(true)}
                  title={t('fields.client')}
                >
                  <span>·</span>
                  <span className="ml-1">{project.clientName ?? `[${t('fields.client')}]`}</span>
                </button>
              )}
            </div>
            </div>
            <div className="flex items-center gap-2 group/title">
              <h1 className="text-2xl font-bold tracking-tight text-foreground" data-testid="text-project-name">
                {project.name}
              </h1>
              <button
                onClick={openEditProject}
                className="opacity-0 group-hover/title:opacity-100 transition-opacity p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                title={t('fields.editProject', { defaultValue: 'Редагувати проєкт' })}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
            {project.summary && (
              <p className="text-sm text-muted-foreground mt-1">{project.summary}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href={`/projects/${projectId}/journal`}>
              <Button variant="outline" size="sm" className="gap-2" data-testid="btn-view-journal">
                <BookOpen className="h-4 w-4" />{t('journal')}
              </Button>
            </Link>
            {confirmArchiveProject ? (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" disabled={archiveProjectMutation.isPending}
                  onClick={() => archiveProjectMutation.mutate()}>
                  {archiveProjectMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                  {t('confirmArchive', { defaultValue: 'Підтвердити архівацію' })}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmArchiveProject(false)}>
                  {t('actions.cancel', {ns:'common'})}
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="gap-2"
                onClick={() => setConfirmArchiveProject(true)}>
                <ArchiveIcon className="h-4 w-4" />{t('archiveProject', { defaultValue: 'Архівувати проєкт' })}
              </Button>
            )}
            {confirmDeleteProject ? (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="destructive" disabled={deleteProjectMutation.isPending}
                  onClick={() => deleteProjectMutation.mutate()}>
                  {deleteProjectMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                  {t('confirmDelete', {ns:'projects', defaultValue:'Confirm delete'})}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteProject(false)}>
                  {t('actions.cancel', {ns:'common'})}
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmDeleteProject(true)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Parameters row */}
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {parentProject && (
            <Link href={`/projects/${parentProject.id}`}>
              <span className="flex items-center gap-1 hover:text-foreground hover:underline cursor-pointer">
                <GitBranch className="h-3.5 w-3.5" />
                {t('parentProject', { defaultValue: 'Батьківський проєкт' })}:
                <span className="font-mono">{parentProject.code}</span>
                <span className="text-foreground">{parentProject.name}</span>
              </span>
            </Link>
          )}
          {project.startsOn && <span>{t('start')} <span className="text-foreground">{project.startsOn}</span></span>}
          {project.dueOn && <span>{t('due')} <span className="text-foreground">{project.dueOn}</span></span>}
          {project.totalHours != null && <span>{t('budget')} <span className="text-foreground">{project.totalHours}h</span></span>}
          {members.length > 0 && (
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              <span className="text-foreground">{members.length}</span>
              <span>{t('tabs.members', { defaultValue: 'members' })}</span>
            </span>
          )}
        </div>

        {/* Subprojects */}
        {childProjects.length > 0 && (
          <div className="rounded-lg border bg-card px-4 py-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-2">
              <GitBranch className="h-3.5 w-3.5" />{t('subprojects', { defaultValue: 'Дочірні проєкти' })}
            </span>
            <div className="flex flex-wrap gap-2">
              {childProjects.map(cp => (
                <Link key={cp.id} href={`/projects/${cp.id}`}>
                  <span className="inline-flex items-center gap-1.5 text-xs bg-muted hover:bg-accent border rounded-full px-2.5 py-1 cursor-pointer transition-colors">
                    <span className="leading-none">{cp.icon}</span>
                    <span className="font-mono text-muted-foreground">{cp.code}</span>
                    <span className="text-foreground">{cp.name}</span>
                    <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Description (collapsible) */}
        {project.descriptionMd && (
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">{displayDesc}</pre>
            {shouldTruncate && (
              <button
                className="text-xs text-primary hover:underline flex items-center gap-1"
                onClick={() => setDescExpanded(!descExpanded)}
              >
                {descExpanded ? <><ChevronUp className="h-3 w-3" />{t('showLess')}</> : <><ChevronDown className="h-3 w-3" />{t('showMore')}</>}
              </button>
            )}
          </div>
        )}

        <Tabs defaultValue="tasks">
          <TabsList>
            <TabsTrigger value="tasks">{t('tabs.tasks')}</TabsTrigger>
            <TabsTrigger value="members">{t('tabs.members')}</TabsTrigger>
            <TabsTrigger value="info">{t('tabs.info', { defaultValue: 'Додаткова інформація' })}</TabsTrigger>
          </TabsList>

          {/* ── Tasks tab ──────────────────────────────────────────────────── */}
          <TabsContent value="tasks" className="space-y-3">

            {/* ── Stages row ─────────────────────────────────────────── */}
            <div className="rounded-lg border bg-card px-4 py-3 mt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" />{t('tabs.stages')}
                </span>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1" onClick={() => setStageDialogOpen(true)}>
                  <Plus className="h-3 w-3" />{t('addStage')}
                </Button>
              </div>
              {stages.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">{t('noStagesYet')}</p>
              ) : (
                <div className="flex items-center gap-0 flex-wrap">
                  {stages.map((stage, idx) => {
                    const done = !!stage.completedAt;
                    const isLast = idx === stages.length - 1;
                    return (
                      <div key={stage.id} className="flex items-center">
                        <div className={cn(
                          'group flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors cursor-pointer select-none',
                          done
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                            : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'
                        )}
                          onClick={() => completeStageMutation.mutate(stage.id)}
                          title={done ? t('clickToUnmark', { defaultValue: 'Натисніть щоб скасувати' }) : t('markComplete', { defaultValue: 'Позначити як виконано' })}
                        >
                          {stage.color && (
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                          )}
                          {done && <span className="text-emerald-500">✓</span>}
                          <span>{stage.name}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void confirm({ title: t('confirmDeleteStage') }).then((accepted) => { if (accepted) deleteStageMutation.mutate(stage.id); });
                            }}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive ml-0.5 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        {!isLast && <span className="text-muted-foreground/40 text-xs px-1">→</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className={cn('px-3 py-1 text-xs rounded-md border', viewMode === 'list' ? 'bg-accent' : '')}
                  onClick={() => setViewMode('list')}
                >{t('view.list')}</button>
                <button
                  className={cn('px-3 py-1 text-xs rounded-md border', viewMode === 'kanban' ? 'bg-accent' : '')}
                  onClick={() => setViewMode('kanban')}
                >{t('view.kanban')}</button>
                <button
                  className={cn('px-3 py-1 text-xs rounded-md border', viewMode === 'stages' ? 'bg-accent' : '')}
                  onClick={() => setViewMode('stages')}
                >{t('view.byStage', { defaultValue: 'За етапами' })}</button>
                <button
                  className={cn('px-3 py-1 text-xs rounded-md border', viewMode === 'timeline' ? 'bg-accent' : '')}
                  onClick={() => setViewMode('timeline')}
                >{t('view.timeline', { defaultValue: 'Таймлайн' })}</button>
                <select
                  className="text-xs border rounded-md px-2 py-1 bg-background"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">{t('allStatuses')}</option>
                  {TASK_STATUSES.map(s => <option key={s} value={s}>{tTask(`status.${s}`, {defaultValue: s.replace('_', ' ')})}</option>)}
                </select>
                {childProjects.length > 0 && (
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeSubprojects}
                      onChange={(e) => setIncludeSubprojects(e.target.checked)}
                      className="rounded"
                    />
                    {t('includeSubprojectTasks', { defaultValue: 'Включно з підпроєктами' })}
                  </label>
                )}
              </div>
              <Button size="sm" className="gap-2" onClick={() => setTaskDialogOpen(true)} data-testid="btn-new-task">
                <Plus className="h-4 w-4" />{tTask('new')}
              </Button>
            </div>

            {tasksLoading ? (
              <div className="flex items-center justify-center h-24">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : tasks.length === 0 ? (
              <div className="rounded-lg border bg-card p-8 text-center">
                <CheckSquare className="h-8 w-8 text-muted-foreground mx-auto opacity-40 mb-2" />
                <p className="text-sm text-muted-foreground">{t('noTasksYet')}</p>
              </div>
            ) : viewMode === 'list' ? (
              <div className="space-y-1">
                {tasks.filter(t => !t.parentTaskId).map((task) => renderTaskRow(task))}
              </div>
            ) : viewMode === 'stages' ? (
              /* Grouped by stage */
              <div className="space-y-4">
                {[...stages, { id: '__none__', name: t('noStage', { defaultValue: '— без стадії —' }), color: null, position: 999, completedAt: null }].map((stage) => {
                  const stageTasks = tasks.filter(t => !t.parentTaskId && (t.stageId ?? '__none__') === stage.id);
                  if (stageTasks.length === 0) return null;
                  return (
                    <div key={stage.id} className="space-y-1.5">
                      <div className="flex items-center gap-2 px-1">
                        {stage.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />}
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{stage.name}</h3>
                        <span className="text-xs text-muted-foreground">({stageTasks.length})</span>
                      </div>
                      <div className="space-y-1">
                        {stageTasks.map((task) => renderTaskRow(task))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : viewMode === 'timeline' ? (
              /* Simple chronological timeline, ordered by due date */
              (() => {
                const rootTasks = tasks.filter(t => !t.parentTaskId);
                const dated = rootTasks
                  .filter(t => t.dueAt)
                  .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime());
                const undated = rootTasks.filter(t => !t.dueAt);
                const groups = new Map<string, Task[]>();
                for (const task of dated) {
                  const key = new Date(task.dueAt!).toLocaleDateString(locale, { year: 'numeric', month: 'long' });
                  if (!groups.has(key)) groups.set(key, []);
                  groups.get(key)!.push(task);
                }
                return (
                  <div className="space-y-6">
                    {[...groups.entries()].map(([month, monthTasks]) => (
                      <div key={month}>
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">{month}</h3>
                        <ol className="relative border-l border-border ml-2 space-y-3">
                          {monthTasks.map((task) => {
                            const stage = task.stageId ? stageById.get(task.stageId) : undefined;
                            const overdue = task.status !== 'done' && new Date(task.dueAt!) < new Date();
                            return (
                              <li key={task.id} className="ml-4">
                                <span className={cn(
                                  'absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full border-2 border-background',
                                  overdue ? 'bg-destructive' : task.status === 'done' ? 'bg-emerald-500' : 'bg-primary'
                                )} />
                                <div
                                  className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5 hover:bg-accent/30 cursor-pointer"
                                  onClick={() => navigate(`/tasks/${task.id}`)}
                                >
                                  <span className="text-xs font-mono text-muted-foreground shrink-0 w-20">
                                    {new Date(task.dueAt!).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                                  </span>
                                  <span className="font-mono text-xs text-muted-foreground shrink-0">{task.code}</span>
                                  <span className="flex-1 text-sm font-medium text-foreground truncate">{task.title}</span>
                                  {stage && (
                                    <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground shrink-0">
                                      {stage.color && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />}
                                      {stage.name}
                                    </span>
                                  )}
                                  <span className={cn('text-xs px-2 py-0.5 rounded-full shrink-0', STATUS_BADGE[task.status])}>
                                    {tTask(`status.${task.status}` as never)}
                                  </span>
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    ))}
                    {undated.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
                          {t('noDueDate', { defaultValue: 'Без терміну' })}
                        </h3>
                        <div className="space-y-1">
                          {undated.map((task) => renderTaskRow(task))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              /* Kanban view with drag-and-drop */
              <KanbanBoard
                tasks={tasks.map(t => ({
                  ...t,
                  stageName: t.stageId ? stages.find(s => s.id === t.stageId)?.name : undefined,
                  stageColor: t.stageId ? stages.find(s => s.id === t.stageId)?.color : undefined,
                })) as KanbanTask[]}
                onStatusChange={(taskId, status) => updateStatusMutation.mutate({ taskId, status })}
                onCardClick={(taskId) => navigate(`/tasks/${taskId}`)}
              />
            )}
            {hasNextPage ? (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                  {isFetchingNextPage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {tTask('loadMore')}
                </Button>
              </div>
            ) : null}
          </TabsContent>

          {/* ── Members tab ────────────────────────────────────────────────── */}
          <TabsContent value="members" className="space-y-3 pt-2">
            {members.length === 0 && !addingMember ? (
              <div className="rounded-lg border bg-card p-8 text-center">
                <Users className="h-8 w-8 mx-auto opacity-40 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">{t('noMembersAdded')}</p>
              </div>
            ) : (
              <div className="space-y-1">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
                    <AvatarBadge name={m.userDisplayName} avatarKey={m.userAvatarKey} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{m.userDisplayName}</p>
                      <p className="text-xs text-muted-foreground">{m.userEmail}</p>
                    </div>
                    <select
                      value={m.role}
                      onChange={(e) => addMemberMutation.mutate({ userId: m.userId, role: e.target.value })}
                      className="text-xs border rounded px-2 py-1 bg-background"
                    >
                      {['owner','manager','member','viewer'].map(r => (
                        <option key={r} value={r}>{t(`members.roles.${r}`, {defaultValue: r})}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => { void confirm({ title: t('confirmRemoveMember') }).then((accepted) => { if (accepted) removeMemberMutation.mutate(m.userId); }); }}
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add member */}
            <div className="pt-2">
              {addingMember ? (
                <div className="flex flex-wrap gap-2 items-center p-3 border rounded-lg bg-card">
                  <select
                    value={newMemberUserId}
                    onChange={(e) => setNewMemberUserId(e.target.value)}
                    className="flex-1 min-w-[180px] text-sm border rounded-md px-3 py-2 bg-background"
                  >
                    <option value="">{t('members.selectUser', {defaultValue: '— обрати користувача —'})}</option>
                    {allUsers
                      .filter(u => !members.some(m => m.userId === u.id))
                      .map(u => <option key={u.id} value={u.id}>{u.displayName} · {u.email}</option>)}
                  </select>
                  <select
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value)}
                    className="text-sm border rounded-md px-3 py-2 bg-background"
                  >
                    {['owner','manager','member','viewer'].map(r => (
                      <option key={r} value={r}>{t(`members.roles.${r}`, {defaultValue: r})}</option>
                    ))}
                  </select>
                  <Button size="sm"
                    disabled={!newMemberUserId || addMemberMutation.isPending}
                    onClick={() => addMemberMutation.mutate({ userId: newMemberUserId, role: newMemberRole })}>
                    {addMemberMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                    {t('members.add', {defaultValue: 'Додати'})}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAddingMember(false); setNewMemberUserId(''); }}>
                    {t('actions.cancel', {ns:'common'})}
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="gap-2" onClick={() => setAddingMember(true)}>
                  <UserPlus className="h-4 w-4" />{t('members.addMember', {defaultValue: 'Додати учасника'})}
                </Button>
              )}
            </div>
          </TabsContent>

          {/* ── Additional info tab ───────────────────────────────────────── */}
          <TabsContent value="info" className="space-y-3 pt-2">
            {editingBlockId === 'new' && (
              <InfoBlockForm
                initialTitle=""
                initialBody=""
                saving={createInfoBlockMutation.isPending}
                onCancel={() => setEditingBlockId(null)}
                onSave={(title, body) => createInfoBlockMutation.mutate({ title, body })}
              />
            )}
            {infoBlocks.length === 0 && editingBlockId !== 'new' ? (
              <div className="rounded-lg border bg-card p-8 text-center">
                <StickyNote className="h-8 w-8 text-muted-foreground mx-auto opacity-40 mb-2" />
                <p className="text-sm text-muted-foreground">{t('info.empty', { defaultValue: 'Додаткової інформації ще немає.' })}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {infoBlocks.map((block) => (
                  editingBlockId === block.id ? (
                    <InfoBlockForm
                      key={block.id}
                      initialTitle={block.title}
                      initialBody={block.body}
                      saving={updateInfoBlockMutation.isPending}
                      onCancel={() => setEditingBlockId(null)}
                      onSave={(title, body) => updateInfoBlockMutation.mutate({ id: block.id, title, body })}
                    />
                  ) : (
                    <div key={block.id} className="rounded-lg border bg-card p-4 group">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-foreground">{block.title}</h3>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            onClick={() => setEditingBlockId(block.id)}
                            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => { void confirm({ title: t('info.confirmDelete') }).then((accepted) => { if (accepted) deleteInfoBlockMutation.mutate(block.id); }); }}
                            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {block.body && (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1.5">{block.body}</p>
                      )}
                    </div>
                  )
                ))}
              </div>
            )}
            {editingBlockId !== 'new' && (
              <Button size="sm" variant="outline" className="gap-2" onClick={() => setEditingBlockId('new')}>
                <Plus className="h-4 w-4" />{t('info.addBlock', { defaultValue: 'Додати блок' })}
              </Button>
            )}
          </TabsContent>
        </Tabs>

        {/* Files + Comments */}
        <div className="rounded-xl border bg-card p-5">
          {filesEnabled ? <FilePanel entityType="project" entityId={projectId} /> : null}
        </div>
        <div className="rounded-xl border bg-card p-5">
          <CommentThread entityType="project" entityId={projectId} />
        </div>

        {/* Create Task Dialog */}
        <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{tTask('new')}</DialogTitle></DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (!taskTitle.trim()) return;
              createTaskMutation.mutate({
                title: taskTitle.trim(),
                priority: taskPriority,
                assigneeId: taskAssignee || undefined,
                dueAt: taskDueDate ? new Date(taskDueDate).toISOString() : undefined,
                stageId: taskStageId || undefined,
              });
            }} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="task-title">{tTask('fields.title')}</Label>
                <Input id="task-title" data-testid="input-task-title" value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)} placeholder={t('taskPlaceholder')} autoFocus required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{tTask('fields.priority')}</Label>
                  <Select value={taskPriority} onValueChange={setTaskPriority}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['low', 'medium', 'high', 'critical'].map(p => <SelectItem key={p} value={p}>{tTask(`priority.${p}`, {defaultValue: p})}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{tTask('fields.dueDate', {defaultValue: 'Дата'})}</Label>
                  <Input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{tTask('fields.assignee', {defaultValue: 'Виконавець'})}</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={taskAssignee}
                  onChange={(e) => setTaskAssignee(e.target.value)}
                >
                  <option value="">{tTask('fields.noAssignee', {defaultValue: '— без виконавця —'})}</option>
                  {members.length > 0
                    ? members.map(m => <option key={m.userId} value={m.userId}>{m.userDisplayName}</option>)
                    : allUsers.map(u => <option key={u.id} value={u.id}>{u.displayName}</option>)
                  }
                </select>
              </div>
              {stages.length > 0 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" />{tTask('fields.stage', {defaultValue: 'Стадія'})}</Label>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={taskStageId}
                    onChange={(e) => setTaskStageId(e.target.value)}
                  >
                    <option value="">{t('noStage', {defaultValue: '— без стадії —'})}</option>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              {taskError && <p className="text-sm text-destructive">{taskError}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setTaskDialogOpen(false)}>{t('actions.cancel', {ns:'common'})}</Button>
                <Button type="submit" disabled={createTaskMutation.isPending || !taskTitle.trim()} data-testid="btn-submit-task">
                  {createTaskMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}{t('actions.create', {ns:'common'})}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Create Stage Dialog */}
        <Dialog open={stageDialogOpen} onOpenChange={setStageDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('addStage')}</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); if (!stageName.trim()) return; createStageMutation.mutate({ name: stageName.trim() }); }} className="space-y-4">
              <div className="space-y-2">
                <Label>{tTask('fields.stage')}</Label>
                <Input value={stageName} onChange={(e) => setStageName(e.target.value)} placeholder={t('stagePlaceholder')} autoFocus required />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setStageDialogOpen(false)}>{t('actions.cancel', {ns:'common'})}</Button>
                <Button type="submit" disabled={createStageMutation.isPending || !stageName.trim()}>
                  {createStageMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}{t('actions.add', {ns:'common'})}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit project dialog */}
        <Dialog open={editProjectOpen} onOpenChange={setEditProjectOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('fields.editProject', { defaultValue: 'Редагувати проєкт' })}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editName.trim()) return;
                updateProjectMutation.mutate({
                  name: editName.trim(),
                  icon: editIcon,
                  summary: editSummary.trim() || null,
                  status: editStatus,
                });
              }}
              className="space-y-5"
            >
              {/* Icon picker */}
              <div className="space-y-2">
                <Label>{t('fields.icon', { defaultValue: 'Іконка проєкту' })}</Label>
                <div className="flex items-center gap-3">
                  <span className="text-4xl leading-none w-12 text-center">{editIcon}</span>
                  <IconPicker value={editIcon} onChange={setEditIcon} />
                </div>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="edit-proj-name">{t('fields.name', { defaultValue: 'Назва' })}</Label>
                <Input
                  id="edit-proj-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              {/* Summary */}
              <div className="space-y-2">
                <Label htmlFor="edit-proj-summary">{t('fields.summary', { defaultValue: 'Короткий опис' })}</Label>
                <Input
                  id="edit-proj-summary"
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  placeholder={t('descriptionPlaceholder', { defaultValue: 'Коротко про що проєкт…' })}
                />
              </div>

              {/* Status */}
              <div className="space-y-2">
                <Label>{t('fields.status', { defaultValue: 'Статус' })}</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['planned','active','on_hold','done','archived'] as const).map(s => (
                      <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditProjectOpen(false)}>
                  {t('actions.cancel', { ns: 'common' })}
                </Button>
                <Button type="submit" disabled={updateProjectMutation.isPending || !editName.trim()}>
                  {updateProjectMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {t('actions.save', { ns: 'common' })}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

      </div>
    );
}

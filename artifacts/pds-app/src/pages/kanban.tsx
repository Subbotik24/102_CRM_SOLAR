/**
 * Global Kanban board — shows all tasks across all projects the user can see,
 * grouped by status. Drag a card to change its status.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Loader2, Kanban } from 'lucide-react';
import { KanbanBoard, type KanbanTask } from '@/components/kanban-board';

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
  return res.json();
}

interface TaskWithProject extends KanbanTask {
  parentTaskId: string | null;
}

export default function KanbanPage() {
  const { t } = useTranslation(['tasks', 'common']);
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery<{ tasks: TaskWithProject[] }>({
    queryKey: ['global-tasks'],
    queryFn: () => apiFetch('/api/tasks?limit=500'),
    staleTime: 30_000,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch<TaskWithProject>(`/api/tasks/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onMutate: async ({ id, status }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['global-tasks'] });
      const prev = queryClient.getQueryData<{ tasks: TaskWithProject[] }>(['global-tasks']);
      queryClient.setQueryData<{ tasks: TaskWithProject[] }>(['global-tasks'], old =>
        old ? { tasks: old.tasks.map(t => t.id === id ? { ...t, status } : t) } : old
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['global-tasks'], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['global-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const tasks = (data?.tasks ?? []).filter(t => !t.parentTaskId);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b bg-background/95 px-5 py-5 backdrop-blur md:px-8 lg:px-10">
        <div className="flex items-center gap-3">
          <Kanban className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t('common:nav.kanban', { defaultValue: 'Канбан' })}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('common:nav.kanbanSubtitle', { defaultValue: 'Всі завдання по всіх проєктах' })}
            </p>
          </div>
          <div className="ml-auto text-sm text-muted-foreground tabular-nums">
            {tasks.length > 0 && `${tasks.length} ${t('common:kanban.taskCount')}`}
          </div>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-auto px-6 md:px-10 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center space-y-3">
            <Kanban className="h-10 w-10 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">
              {t('common:kanban.empty', { defaultValue: 'Завдань поки немає. Створіть завдання в проєкті.' })}
            </p>
          </div>
        ) : (
          <KanbanBoard
            tasks={tasks}
            onStatusChange={(id, status) => updateStatusMutation.mutate({ id, status })}
            onCardClick={(id) => navigate(`/tasks/${id}`)}
          />
        )}
      </div>
    </div>
  );
}

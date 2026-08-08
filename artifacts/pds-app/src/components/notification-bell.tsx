import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bell, CheckCheck, Loader2, AlertCircle, Clock } from 'lucide-react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';

async function apiFetch<T = void>(path: string, opts?: RequestInit): Promise<T> {
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

interface Notification {
  id: string;
  kind: string;
  entityType: string | null;
  entityId: string | null;
  payload: string;
  readAt: string | null;
  createdAt: string;
}

interface DueTask {
  id: string;
  code: string;
  title: string;
  projectId: string;
  dueAt: string;
  kind: 'task_due_today' | 'task_overdue';
}

function entityNavPath(n: Notification): string | null {
  if (!n.entityType || !n.entityId) return null;
  switch (n.entityType) {
    case 'task': return `/tasks/${n.entityId}`;
    case 'project': return `/projects/${n.entityId}`;
    case 'conversation': return `/chat/${n.entityId}`;
    default: return null;
  }
}

export function NotificationBell() {
  const { t, i18n } = useTranslation('common');
  const locale = i18n.language === 'cs' ? 'cs-CZ' : 'uk-UA';
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const { data } = useQuery<{ notifications: Notification[]; unreadCount: number; dueTasks: DueTask[]; dueTaskCount: number; attentionCount: number }>({
    queryKey: ['notifications'],
    queryFn: () => apiFetch('/api/notifications'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const markOne = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAll = useMutation({
    mutationFn: () => apiFetch('/api/notifications/mark-all-read', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unread = data?.unreadCount ?? 0;
  const attention = data?.attentionCount ?? 0;
  const notifications = data?.notifications ?? [];
  const dueTasks = data?.dueTasks ?? [];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const el = document.getElementById('notification-bell-panel');
      if (el && !el.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function handleClick(n: Notification) {
    if (!n.readAt) markOne.mutate(n.id);
    const path = entityNavPath(n);
    if (path) { navigate(path); setOpen(false); }
  }

  function kindLabel(kind: string): string {
    switch (kind) {
      case 'mention': return t('notifications.mention');
      case 'task_assigned': return t('notifications.taskAssigned');
      case 'new_message': return t('notifications.newMessage');
      case 'new_comment': return t('notifications.newComment');
      case 'deletion_requested': return t('notifications.deletionRequested');
      default: return kind;
    }
  }

  return (
    <div className="relative" id="notification-bell-panel">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-md hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-accent-foreground transition-colors"
        aria-label={t('notifications.title')}
      >
        <Bell className="h-5 w-5" />
        {attention > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-0.5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none">
            {attention > 99 ? '99+' : attention}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 md:left-0 md:right-auto mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-sm font-semibold">{t('notifications.title')}</span>
            {unread > 0 && (
              <button
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                {markAll.isPending
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <CheckCheck className="h-3 w-3" />}
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {dueTasks.map((dt) => (
              <button
                key={`due-${dt.id}`}
                onClick={() => { navigate(`/tasks/${dt.id}`); setOpen(false); }}
                className="w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors block bg-destructive/5"
              >
                <div className="flex items-start gap-2">
                  {dt.kind === 'task_overdue'
                    ? <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-destructive" />
                    : <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      {dt.kind === 'task_overdue' ? t('notifications.taskOverdue') : t('notifications.taskDueToday')}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{dt.code} · {dt.title}</p>
                  </div>
                </div>
              </button>
            ))}
            {notifications.length === 0 && dueTasks.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">{t('notifications.noNotifications')}</div>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors block",
                    !n.readAt && "bg-primary/5"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {!n.readAt && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                    <div className={cn("flex-1 min-w-0", n.readAt && "pl-4")}>
                      <p className="text-xs font-medium text-foreground">{kindLabel(n.kind)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {(() => { try { const p = JSON.parse(n.payload); return p.taskTitle ?? p.preview ?? p.mentionedIn ?? p.entityLabel ?? ''; } catch { return ''; } })()}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">
                        {new Date(n.createdAt).toLocaleString(locale)}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Edit2, Trash2, Loader2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
  return res.json() as Promise<T>;
}

interface Comment {
  id: string;
  authorId: string;
  authorDisplayName: string | null;
  bodyMd: string;
  bodyHtml: string;
  visibility: 'internal' | 'external';
  editedAt: string | null;
  createdAt: string;
}

interface Props {
  entityType: 'project' | 'task' | 'kb_article';
  entityId: string;
  canSeeInternal?: boolean;
}

export function CommentThread({ entityType, entityId, canSeeInternal = true }: Props) {
  const { t, i18n } = useTranslation('common');
  const locale = i18n.language === 'cs' ? 'cs-CZ' : 'uk-UA';
  const qc = useQueryClient();

  const { data: meData } = useQuery<{ id: string }>({
    queryKey: ['me'],
    queryFn: () => apiFetch('/api/auth/me') as Promise<{ id: string }>,
    staleTime: 60_000,
  });
  const currentUserId = meData?.id;
  const qKey = ['comments', entityType, entityId];

  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<'internal' | 'external'>('internal');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  const { data, isLoading } = useQuery<{ comments: Comment[] }>({
    queryKey: qKey,
    queryFn: () => apiFetch<{ comments: Comment[] }>(`/api/comments?entityType=${entityType}&entityId=${entityId}`),
  });

  const comments = data?.comments ?? [];

  const addMut = useMutation({
    mutationFn: (payload: { entityType: string; entityId: string; bodyMd: string; visibility: string }) =>
      apiFetch('/api/comments', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qKey }); setBody(''); },
  });

  const editMut = useMutation({
    mutationFn: ({ id, bodyMd }: { id: string; bodyMd: string }) =>
      apiFetch(`/api/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ bodyMd }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qKey }); setEditingId(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/comments/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    addMut.mutate({ entityType, entityId, bodyMd: body.trim(), visibility });
  }

  function startEdit(c: Comment) {
    setEditingId(c.id);
    setEditBody(c.bodyMd);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <MessageCircle className="h-4 w-4" />
        {t('comments.title')} {comments.length > 0 && <span className="text-muted-foreground">({comments.length})</span>}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">{t('comments.noComments')}</p>
      ) : (
        <div className="space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-[10px] font-medium px-1.5 py-0.5 rounded border",
                    c.visibility === 'external'
                      ? 'border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                      : 'border-muted bg-muted/30 text-muted-foreground'
                  )}>
                    {c.visibility === 'external' ? t('comments.visibility.external') : t('comments.visibility.internal')}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    {c.authorDisplayName && (
                      <span className="font-medium text-foreground">{c.authorDisplayName}</span>
                    )}
                    <span>·</span>
                    {new Date(c.createdAt).toLocaleString(locale)}
                    {c.editedAt && <span className="ml-1">{t('comments.edited')}</span>}
                  </span>
                </div>
                {c.authorId === currentUserId && (
                  <div className="flex gap-1">
                    <button onClick={() => startEdit(c)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
                      <Edit2 className="h-3 w-3" />
                    </button>
                    <button onClick={() => deleteMut.mutate(c.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
              {editingId === c.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={3}
                    className="text-sm resize-none"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => editMut.mutate({ id: c.id, bodyMd: editBody.trim() })} disabled={editMut.isPending || !editBody.trim()}>
                      {editMut.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}{t('actions.save')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>{t('actions.cancel')}</Button>
                  </div>
                </div>
              ) : (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: c.bodyHtml }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add comment form */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('comments.placeholder')}
          rows={3}
          className="text-sm resize-none"
        />
        <div className="flex items-center justify-between">
          {canSeeInternal && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setVisibility(v => v === 'internal' ? 'external' : 'internal')}
                className={cn(
                  "text-xs flex items-center gap-1 px-2 py-1 rounded border transition-colors",
                  visibility === 'external'
                    ? 'border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : 'border-muted bg-muted/30 text-muted-foreground'
                )}
              >
                {visibility === 'external' ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {visibility === 'external' ? t('comments.visibility.external') : t('comments.visibility.internal')}
              </button>
            </div>
          )}
          <Button type="submit" size="sm" disabled={addMut.isPending || !body.trim()} className="ml-auto">
            {addMut.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}{t('comments.post')}
          </Button>
        </div>
      </form>
    </div>
  );
}

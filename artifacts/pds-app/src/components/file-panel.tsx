/**
 * FilePanel — shows file list for a project or task with upload button.
 */
import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Paperclip, Upload, Loader2, Download, ChevronDown, ChevronRight,
  AlertTriangle, Clock, CheckCircle2, XCircle, Trash2, Check, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/confirm-provider';
import { appLocale } from '@/lib/locale';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface FileRecord {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: 'pending' | 'stored' | 'failed' | 'missing';
  storageLocation: 'staging' | 'dropbox';
  versionNo: number;
  documentGroupId: string;
  visibility: 'internal' | 'external';
  createdAt: string;
  pendingDeletion: { id: string; requestedById: string } | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: FileRecord['status'] }) {
  const { t } = useTranslation('files');
  const map: Record<FileRecord['status'], { icon: typeof Clock; cls: string; labelKey: string }> = {
    pending:  { icon: Clock,         cls: 'text-amber-500',   labelKey: 'status.pending' },
    stored:   { icon: CheckCircle2,  cls: 'text-emerald-500', labelKey: 'status.stored'  },
    failed:   { icon: XCircle,       cls: 'text-destructive', labelKey: 'status.failed'  },
    missing:  { icon: AlertTriangle, cls: 'text-orange-500',  labelKey: 'status.missing' },
  };
  const { icon: Icon, cls, labelKey } = map[status];
  return (
    <span className={cn('flex items-center gap-1 text-xs font-medium', cls)}>
      <Icon className="h-3 w-3" />{t(labelKey)}
    </span>
  );
}

async function apiFetch<T = void>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: opts?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? res.statusText);
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T;
  return res.json() as Promise<T>;
}

interface Props {
  entityType: 'project' | 'task';
  entityId: string;
}

export function FilePanel({ entityType, entityId }: Props) {
  const { t, i18n } = useTranslation('files');
  const locale = appLocale(i18n.language);
  const { toast } = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);

  const qKey = ['files', entityType, entityId];

  const { data, isLoading } = useQuery<{ files: FileRecord[] }>({
    queryKey: qKey,
    queryFn: () => apiFetch(`/api/files?entityType=${entityType}&entityId=${entityId}`),
    refetchInterval: 15_000,
  });

  const { data: me } = useQuery<{ id: string; role: string }>({
    queryKey: ['me'],
    queryFn: () => apiFetch('/api/auth/me'),
    staleTime: 60_000,
  });
  const isAdmin = me?.role === 'admin';
  const isGuest = me?.role === 'guest';

  const files = data?.files ?? [];

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => apiFetch<{ status?: string } | undefined>(`/api/files/${fileId}`, { method: 'DELETE' }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: qKey });
      if (result?.status === 'pending') {
        toast({ title: t('deleteRequested') });
      }
    },
    onError: (err) => {
      toast({ title: t('deleteFailed'), description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (requestId: string) => apiFetch(`/api/deletion-requests/${requestId}/approve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
    onError: (err) => toast({ title: t('deleteFailed'), description: err instanceof Error ? err.message : undefined, variant: 'destructive' }),
  });

  const rejectMutation = useMutation({
    mutationFn: (requestId: string) => apiFetch(`/api/deletion-requests/${requestId}/reject`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
    onError: (err) => toast({ title: t('deleteFailed'), description: err instanceof Error ? err.message : undefined, variant: 'destructive' }),
  });

  const latestByGroup = new Map<string, FileRecord>();
  const allByGroup = new Map<string, FileRecord[]>();
  for (const f of files) {
    const existing = latestByGroup.get(f.documentGroupId);
    if (!existing || f.versionNo > existing.versionNo) latestByGroup.set(f.documentGroupId, f);
    if (!allByGroup.has(f.documentGroupId)) allByGroup.set(f.documentGroupId, []);
    allByGroup.get(f.documentGroupId)!.push(f);
  }
  const latestFiles = [...latestByGroup.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      await apiFetch(`/api/files?entityType=${entityType}&entityId=${entityId}`, { method: 'POST', body });
      qc.invalidateQueries({ queryKey: qKey });
    } catch (err) {
      toast({
        title: t('uploadFailed'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  }

  function downloadUrl(fileId: string) {
    return `${BASE}/api/files/${fileId}/download`;
  }

  function toggleGroup(groupId: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Paperclip className="h-4 w-4" />
          {t('title')} {latestFiles.length > 0 && <span className="text-muted-foreground">({latestFiles.length})</span>}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="gap-1.5"
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          {t('upload')}
        </Button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : latestFiles.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">{t('noFiles')}</p>
      ) : (
        <div className="space-y-1">
          {latestFiles.map((file) => {
            const versions = allByGroup.get(file.documentGroupId) ?? [];
            const hasVersions = versions.length > 1;
            const expanded = expandedGroups.has(file.documentGroupId);
            return (
              <div key={file.documentGroupId} className="rounded-lg border bg-card overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  {hasVersions ? (
                    <button onClick={() => toggleGroup(file.documentGroupId)} className="text-muted-foreground hover:text-foreground">
                      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  ) : (
                    <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-foreground">{file.originalFilename}</p>
                    <p className="text-xs text-muted-foreground">
                      v{file.versionNo} · {formatBytes(file.sizeBytes)} · {new Date(file.createdAt).toLocaleDateString(locale)}
                    </p>
                  </div>
                  <StatusBadge status={file.status} />
                  {file.pendingDeletion && (
                    <span className="flex items-center gap-1 text-xs font-medium text-amber-500 shrink-0">
                      <AlertTriangle className="h-3 w-3" />{t('pendingDeletion')}
                    </span>
                  )}
                  {file.pendingDeletion && isAdmin && (
                    <>
                      <button
                        onClick={() => approveMutation.mutate(file.pendingDeletion!.id)}
                        disabled={approveMutation.isPending}
                        className="p-1.5 rounded hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-600"
                        title={t('approve')}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => rejectMutation.mutate(file.pendingDeletion!.id)}
                        disabled={rejectMutation.isPending}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        title={t('reject')}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  {file.status !== 'missing' && (
                    <a
                      href={downloadUrl(file.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                      title={t('download')}
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  )}
                  {!file.pendingDeletion && !isGuest && (
                    <button
                      onClick={() => { void confirm({ title: t('confirmDelete') }).then((accepted) => { if (accepted) deleteMutation.mutate(file.id); }); }}
                      disabled={deleteMutation.isPending}
                      className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      title={t('delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {expanded && hasVersions && (
                  <div className="border-t bg-muted/30 px-4 py-2 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground mb-2">{t('allVersions')}</p>
                    {[...versions].sort((a, b) => b.versionNo - a.versionNo).map((v) => (
                      <div key={v.id} className="flex items-center gap-3 text-xs py-1">
                        <span className="text-muted-foreground w-6 shrink-0">v{v.versionNo}</span>
                        <span className="flex-1 truncate text-foreground">{v.originalFilename}</span>
                        <StatusBadge status={v.status} />
                        {v.pendingDeletion && (
                          <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                        )}
                        {v.status !== 'missing' && (
                          <a href={downloadUrl(v.id)} target="_blank" rel="noreferrer" className="p-1 rounded hover:bg-accent text-muted-foreground" title={t('download')}>
                            <Download className="h-3 w-3" />
                          </a>
                        )}
                        {!v.pendingDeletion && !isGuest && (
                          <button
                            onClick={() => { void confirm({ title: t('confirmDelete') }).then((accepted) => { if (accepted) deleteMutation.mutate(v.id); }); }}
                            disabled={deleteMutation.isPending}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                            title={t('delete')}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

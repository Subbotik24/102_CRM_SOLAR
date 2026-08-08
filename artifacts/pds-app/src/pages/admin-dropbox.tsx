/**
 * Dropbox admin screen — connect/disconnect Dropbox, show space usage.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Cloud, CheckCircle2, AlertCircle, Loader2, LogOut, HardDrive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function apiFetch<T = void>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? res.statusText);
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T;
  return res.json() as Promise<T>;
}

interface DropboxStatus {
  connected: boolean;
  email: string;
  space: { used: number; allocated: number } | null;
}

function formatGB(bytes: number): string {
  return (bytes / (1024 ** 3)).toFixed(2) + ' GB';
}

export default function AdminDropboxPage() {
  const { t } = useTranslation('admin');
  const qc = useQueryClient();
  const [error, setError] = useState('');

  const { data: status, isLoading } = useQuery<DropboxStatus>({
    queryKey: ['dropbox-status'],
    queryFn: () => apiFetch('/api/admin/dropbox/status'),
    retry: false,
  });

  const disconnectMut = useMutation({
    mutationFn: () => apiFetch('/api/admin/dropbox/disconnect', { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dropbox-status'] }),
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-60">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const usedPct = status?.space
    ? Math.round((status.space.used / status.space.allocated) * 100)
    : null;

  const lowSpace = usedPct !== null && usedPct >= 90;

  return (
    <div className="max-w-xl mx-auto py-10 px-4 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('dropbox.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('dropbox.description')}</p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="rounded-xl border bg-card p-6 space-y-6">
        {/* Connection status */}
        <div className="flex items-start gap-4">
          <div className={`p-2 rounded-lg ${status?.connected ? 'bg-emerald-50 dark:bg-emerald-950' : 'bg-muted'}`}>
            <Cloud className={`h-6 w-6 ${status?.connected ? 'text-emerald-500' : 'text-muted-foreground'}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold">{t('dropbox.title')}</p>
              {status?.connected ? (
                <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                  <CheckCircle2 className="h-3 w-3" /> {t('dropbox.connected')}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">{t('dropbox.notConnected')}</span>
              )}
            </div>
            {status?.connected && status.email && (
              <p className="text-sm text-muted-foreground mt-0.5">{status.email}</p>
            )}
          </div>
        </div>

        {/* Space usage */}
        {status?.connected && status.space && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <HardDrive className="h-4 w-4" />
              <span>
                {formatGB(status.space.used)} {t('dropbox.usedOf')} {formatGB(status.space.allocated)}
              </span>
              {lowSpace && (
                <span className="text-orange-500 font-medium">⚠ {t('dropbox.lowSpace')}</span>
              )}
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${lowSpace ? 'bg-orange-500' : 'bg-primary'}`}
                style={{ width: `${Math.min(usedPct ?? 0, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          {status?.connected ? (
            <Button
              variant="outline"
              onClick={() => disconnectMut.mutate()}
              disabled={disconnectMut.isPending}
              className="text-destructive border-destructive/40 hover:bg-destructive/10"
            >
              {disconnectMut.isPending
                ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                : <LogOut className="h-4 w-4 mr-2" />}
              {t('dropbox.disconnect')}
            </Button>
          ) : (
            <Button asChild>
              <a href={`${BASE}/api/admin/dropbox/connect`}>
                <Cloud className="h-4 w-4 mr-2" />
                {t('dropbox.connect')}
              </a>
            </Button>
          )}
        </div>

        {!status?.connected && (
          <p className="text-xs text-muted-foreground border-t pt-4">
            {t('dropbox.offlineNotice')}
          </p>
        )}
      </div>
    </div>
  );
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Archive as ArchiveIcon, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { appLocale } from '@/lib/locale';

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
  return res.json();
}

interface ArchivedProject {
  id: string; code: string; name: string; icon: string;
  clientName: string | null; archivedAt: string | null;
}

export default function ArchivePage() {
  const { t, i18n } = useTranslation('projects');
  const locale = appLocale(i18n.language);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ projects: ArchivedProject[] }>({
    queryKey: ['projects', 'archived'],
    queryFn: () => apiFetch('/api/projects?archived=true'),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/projects/${id}/restore`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const projects = data?.projects ?? [];

  return (
    <div className="flex-1 p-6 md:p-10 space-y-6 max-w-4xl">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <ArchiveIcon className="h-7 w-7 text-primary" />
          {t('archive.title', { defaultValue: 'Архів' })}
        </h1>
        <p className="text-muted-foreground">{t('archive.subtitle', { defaultValue: 'Архівовані проєкти.' })}</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center space-y-3">
          <ArchiveIcon className="h-10 w-10 text-muted-foreground mx-auto opacity-40" />
          <p className="text-muted-foreground">{t('archive.empty', { defaultValue: 'Архів порожній.' })}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => (
            <div key={p.id} className="flex items-center gap-4 rounded-lg border bg-card px-5 py-4 opacity-80">
              <span className="text-2xl leading-none shrink-0">{p.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="font-mono">{p.code}</span>
                  {p.clientName && <><span>·</span><span>{p.clientName}</span></>}
                </div>
                <p className="font-semibold text-foreground">{p.name}</p>
                {p.archivedAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('archive.archivedOn')} {new Date(p.archivedAt).toLocaleDateString(locale)}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 shrink-0"
                disabled={restoreMutation.isPending}
                onClick={() => restoreMutation.mutate(p.id)}
              >
                {restoreMutation.isPending && restoreMutation.variables === p.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RotateCcw className="h-3.5 w-3.5" />}
                {t('archive.restore', { defaultValue: 'Відновити' })}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

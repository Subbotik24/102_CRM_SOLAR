import { useState } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus, ChevronRight, Loader2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ErrorState, LoadingState } from '@/components/design/system';

interface Project {
  id: string; code: string; name: string; icon: string;
  status: string; depth: number; path: string;
  parentId: string | null; summary: string | null;
  clientName: string | null; ownerId: string; createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  planned:  'bg-slate-500/20 text-slate-400',
  active:   'bg-blue-500/20 text-blue-400',
  on_hold:  'bg-amber-500/20 text-amber-400',
  done:     'bg-emerald-500/20 text-emerald-400',
  archived: 'bg-zinc-500/20 text-zinc-400',
};

const PROJECT_ICONS = [
  '📁','📂','🏗️','💡','🔧','🎯','🚀','🌐',
  '📊','📱','🔬','🏢','🎨','📝','🔒','🌱',
  '⚡','🤝','🛠️','💼','🧪','📐','🗂️','🏆',
];

const STATUS_BORDER: Record<string, string> = {
  planned: 'border-l-slate-400',
  active: 'border-l-blue-500',
  on_hold: 'border-l-amber-400',
  done: 'border-l-emerald-500',
  archived: 'border-l-zinc-400',
};

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

function buildTree(projects: Project[]): Array<Project & { children: Project[] }> {
  const byId = new Map<string, Project & { children: Project[] }>();
  const roots: Array<Project & { children: Project[] }> = [];
  const sorted = [...projects].sort((a, b) => a.path.localeCompare(b.path));
  for (const p of sorted) byId.set(p.id, { ...p, children: [] });
  for (const p of sorted) {
    const node = byId.get(p.id)!;
    if (p.parentId && byId.has(p.parentId)) byId.get(p.parentId)!.children.push(node);
    else roots.push(node);
  }
  return roots;
}

type TreeProject = Project & { children: TreeProject[] };

function ProjectRow({ project, depth }: { project: TreeProject; depth: number }) {
  const [expanded, setExpanded] = useState(true);
  const { t } = useTranslation('projects');
  const hasChildren = project.children.length > 0;

  return (
    <div>
      <Link href={`/projects/${project.id}`}>
        <div
          className={cn(
            'flex items-center gap-3 rounded-lg border bg-card px-4 py-3.5 hover:bg-accent/50 transition-colors cursor-pointer group border-l-4',
            STATUS_BORDER[project.status] ?? 'border-l-zinc-400',
          )}
          style={{ marginLeft: depth * 20 }}
          data-testid={`project-row-${project.code}`}
        >
          {/* Expand / indent toggle */}
          {hasChildren ? (
            <button
              className="text-muted-foreground hover:text-foreground shrink-0"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(!expanded); }}
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <div className="w-4 shrink-0" />
          )}

          {/* Emoji icon */}
          <span className="text-xl leading-none shrink-0" aria-hidden="true">{project.icon ?? '📁'}</span>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-mono text-xs text-muted-foreground shrink-0">{project.code}</span>
              <span className="font-semibold text-foreground truncate">{project.name}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {project.clientName && (
                <span className="truncate hidden sm:block">{project.clientName}</span>
              )}
              {project.summary && (
                <span className="truncate">{project.summary}</span>
              )}
            </div>
          </div>

          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full shrink-0', STATUS_COLORS[project.status] ?? 'bg-zinc-500/20 text-zinc-400')}>
            {t(`status.${project.status}` as never)}
          </span>
        </div>
      </Link>
      {hasChildren && expanded && (
        <div className="mt-1 space-y-1">
          {project.children.map((child) => (
            <ProjectRow key={child.id} project={child as TreeProject} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

interface Client { id: string; name: string; industry: string | null; }

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

export default function ProjectsPage() {
  const { t } = useTranslation('projects');
  const { t: tc } = useTranslation('common');
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [icon, setIcon] = useState('📁');
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [parentId, setParentId] = useState('');
  const [clientId, setClientId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const { data, isLoading, isError, refetch } = useQuery<{ projects: Project[] }>({
    queryKey: ['projects'],
    queryFn: () => apiFetch('/api/projects'),
  });

  const { data: clientsData } = useQuery<{ clients: Client[] }>({
    queryKey: ['clients'],
    queryFn: () => apiFetch('/api/clients'),
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; icon: string; summary?: string; parentId?: string; clientId?: string }) =>
      apiFetch<Project>('/api/projects', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setDialogOpen(false);
      setIcon('📁'); setName(''); setSummary(''); setParentId(''); setClientId(''); setErrorMsg('');
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      icon,
      summary: summary.trim() || undefined,
      parentId: parentId || undefined,
      clientId: clientId || undefined,
    });
  };

  const projects = data?.projects ?? [];
  const tree = buildTree(projects);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="shrink-0 border-b bg-background/95 px-5 py-5 backdrop-blur md:px-8 lg:px-10">
        <div className="flex items-center gap-3">
          <Layers className="h-6 w-6 text-primary shrink-0" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground" data-testid="text-page-title">
              {t('title')}
            </h1>
            <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>
          <div className="ml-auto">
            <Button onClick={() => setDialogOpen(true)} className="gap-2" data-testid="btn-new-project">
              <Plus className="h-4 w-4" />{t('new')}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto px-6 md:px-10 py-6">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={tc('status.error')} onRetry={() => void refetch()} />
        ) : projects.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 shadow-sm text-center space-y-3">
            <Layers className="h-10 w-10 text-muted-foreground mx-auto opacity-40" />
            <p className="text-muted-foreground">{t('noProjects')}</p>
            <Button variant="outline" onClick={() => setDialogOpen(true)} data-testid="btn-new-project-empty">
              <Plus className="h-4 w-4 mr-2" />{t('new')}
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            {tree.map((project) => (
              <ProjectRow key={project.id} project={project as TreeProject} depth={0} />
            ))}
          </div>
        )}
      </div>

      {/* ── Create dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-testid="dialog-new-project">
          <DialogHeader><DialogTitle>{t('new')}</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">

            {/* Icon picker */}
            <div className="space-y-2">
              <Label>{t('fields.icon', { defaultValue: 'Іконка' })}</Label>
              <div className="flex items-center gap-3">
                <span className="text-4xl leading-none w-12 text-center">{icon}</span>
                <IconPicker value={icon} onChange={setIcon} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="proj-name">{t('fields.name')}</Label>
              <Input id="proj-name" data-testid="input-project-name" value={name}
                onChange={(e) => setName(e.target.value)} placeholder={t('projectNamePlaceholder')} autoFocus required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proj-summary">{t('fields.summary')}</Label>
              <Input id="proj-summary" data-testid="input-project-summary" value={summary}
                onChange={(e) => setSummary(e.target.value)} placeholder={t('descriptionPlaceholder')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proj-client">{t('fields.client')}</Label>
              <select id="proj-client"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">{tc('clients.noClient', { defaultValue: '— без замовника —' })}</option>
                {(clientsData?.clients ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.industry ? ` · ${c.industry}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="proj-parent">{t('fields.parentProject')}</Label>
              <select id="proj-parent"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">{t('parentProjectPlaceholder')}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{'  '.repeat(p.depth)}{p.icon} {p.code} {p.name}</option>
                ))}
              </select>
            </div>

            {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {tc('actions.cancel')}
              </Button>
              <Button type="submit" disabled={createMutation.isPending || !name.trim()} data-testid="btn-submit-project">
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {tc('actions.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

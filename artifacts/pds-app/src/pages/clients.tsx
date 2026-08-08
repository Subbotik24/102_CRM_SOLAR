import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronRight, Loader2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AvatarBadge, AvatarPicker } from '@/components/ui/avatar-badge';

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

interface ClientProject {
  id: string; code: string; name: string; icon: string; status: string;
}

interface Client {
  id: string; name: string; website: string | null; industry: string | null;
  internalNote?: string | null; avatarKey?: string | null;
  archivedAt: string | null; createdAt: string;
  projects?: ClientProject[];
}

export default function ClientsPage() {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [industry, setIndustry] = useState('');
  const [createAvatarKey, setCreateAvatarKey] = useState('1');
  const [createError, setCreateError] = useState('');

  // Edit dialog
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [editName, setEditName] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editIndustry, setEditIndustry] = useState('');
  const [editAvatarKey, setEditAvatarKey] = useState('1');
  const [editError, setEditError] = useState('');

  const { data, isLoading } = useQuery<{ clients: Client[] }>({
    queryKey: ['clients'],
    queryFn: () => apiFetch('/api/clients'),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; website?: string; industry?: string; avatarKey?: string }) =>
      apiFetch<Client>('/api/clients', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setCreateOpen(false); setName(''); setWebsite(''); setIndustry('');
      setCreateAvatarKey('1'); setCreateError('');
    },
    onError: (err: Error) => setCreateError(err.message),
  });

  const editMutation = useMutation({
    mutationFn: (payload: { name: string; website?: string | null; industry?: string | null; avatarKey?: string }) =>
      apiFetch<Client>(`/api/clients/${editClient!.id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setEditClient(null); setEditError('');
    },
    onError: (err: Error) => setEditError(err.message),
  });

  const openEdit = (client: Client, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setEditClient(client);
    setEditName(client.name);
    setEditWebsite(client.website ?? '');
    setEditIndustry(client.industry ?? '');
    setEditAvatarKey(client.avatarKey ?? '1');
    setEditError('');
  };

  const clients = data?.clients ?? [];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b bg-background/95 px-5 py-5 backdrop-blur md:px-8 lg:px-10">
        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6 text-primary shrink-0" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('clients.pageTitle')}</h1>
            <p className="text-sm text-muted-foreground">{t('clients.pageSubtitle')}</p>
          </div>
          <div className="ml-auto">
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />{t('clients.newClient')}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 md:px-10 py-6 space-y-6">

        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : clients.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center space-y-3">
            <Building2 className="h-10 w-10 text-muted-foreground mx-auto opacity-40" />
            <p className="text-muted-foreground">{t('clients.noClients')}</p>
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />{t('clients.addFirst')}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {clients.map((client) => (
              <div key={client.id} className="flex items-center gap-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors group">
                <Link href={`/clients/${client.id}`} className="flex-1 flex items-center gap-4 px-5 py-4 cursor-pointer min-w-0">
                  <AvatarBadge name={client.name} avatarKey={client.avatarKey} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">{client.name}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      {client.industry && <span>{client.industry}</span>}
                      {client.website && <span className="truncate max-w-[160px]">{client.website}</span>}
                    </div>
                    {(client.projects ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {(client.projects ?? []).map((p) => (
                          <span
                            key={p.id}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/projects/${p.id}`); }}
                            className="inline-flex items-center gap-1 text-xs bg-muted hover:bg-accent border rounded-full px-2 py-0.5 cursor-pointer transition-colors"
                          >
                            <span className="leading-none">{p.icon}</span>
                            <span className="font-mono text-muted-foreground">{p.code}</span>
                            <span className="text-foreground truncate max-w-[120px]">{p.name}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
                <button
                  className="opacity-0 group-hover:opacity-100 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border transition-all mr-2"
                  onClick={(e) => { e.preventDefault(); openEdit(client, e); }}
                >
                  {t('actions.edit')}
                </button>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mr-4" />
              </div>
            ))}
          </div>
        )}

        {/* Create dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('clients.newClient')}</DialogTitle></DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!name.trim()) return;
                createMutation.mutate({
                  name: name.trim(),
                  website: website.trim() || undefined,
                  industry: industry.trim() || undefined,
                  avatarKey: createAvatarKey,
                });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>{t('clients.fields.name')}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)}
                  placeholder={t('clients.fields.namePlaceholder')} autoFocus required />
              </div>
              <div className="space-y-2">
                <Label>{t('clients.fields.industry')}</Label>
                <Input value={industry} onChange={(e) => setIndustry(e.target.value)}
                  placeholder={t('clients.fields.industryPlaceholder')} />
              </div>
              <div className="space-y-2">
                <Label>{t('clients.fields.website')}</Label>
                <Input value={website} onChange={(e) => setWebsite(e.target.value)}
                  placeholder={t('clients.fields.websitePlaceholder')} />
              </div>
              <div className="space-y-2">
                <Label>{t('clients.fields.avatar', { defaultValue: 'Колір аватара' })}</Label>
                <div className="flex items-center gap-3">
                  <AvatarBadge name={name || '?'} avatarKey={createAvatarKey} size="sm" />
                  <AvatarPicker current={createAvatarKey} onChange={setCreateAvatarKey} />
                </div>
              </div>
              {createError && <p className="text-sm text-destructive">{createError}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t('actions.cancel')}</Button>
                <Button type="submit" disabled={createMutation.isPending || !name.trim()}>
                  {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}{t('actions.create')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit dialog */}
        <Dialog open={!!editClient} onOpenChange={(o) => { if (!o) setEditClient(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('clients.editClient', { defaultValue: 'Редагувати замовника' })}</DialogTitle></DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editName.trim() || !editClient) return;
                editMutation.mutate({
                  name: editName.trim(),
                  website: editWebsite.trim() || null,
                  industry: editIndustry.trim() || null,
                  avatarKey: editAvatarKey,
                });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>{t('clients.fields.name')}</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)}
                  placeholder={t('clients.fields.namePlaceholder')} autoFocus required />
              </div>
              <div className="space-y-2">
                <Label>{t('clients.fields.industry')}</Label>
                <Input value={editIndustry} onChange={(e) => setEditIndustry(e.target.value)}
                  placeholder={t('clients.fields.industryPlaceholder')} />
              </div>
              <div className="space-y-2">
                <Label>{t('clients.fields.website')}</Label>
                <Input value={editWebsite} onChange={(e) => setEditWebsite(e.target.value)}
                  placeholder={t('clients.fields.websitePlaceholder')} />
              </div>
              <div className="space-y-2">
                <Label>{t('clients.fields.avatar', { defaultValue: 'Колір аватара' })}</Label>
                <div className="flex items-center gap-3">
                  <AvatarBadge name={editName || editClient?.name || '?'} avatarKey={editAvatarKey} size="sm" />
                  <AvatarPicker current={editAvatarKey} onChange={setEditAvatarKey} />
                </div>
              </div>
              {editError && <p className="text-sm text-destructive">{editError}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditClient(null)}>{t('actions.cancel')}</Button>
                <Button type="submit" disabled={editMutation.isPending || !editName.trim()}>
                  {editMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}{t('actions.save')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

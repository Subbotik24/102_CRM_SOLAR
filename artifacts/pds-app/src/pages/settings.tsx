/**
 * Unified Settings page — Members + System tabs.
 * Accessible to admin and manager roles only.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Settings, Users, UserPlus, Loader2, Save, CheckCircle2, Plus, Pencil, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { AvatarBadge, AvatarPicker } from '@/components/ui/avatar-badge';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/components/confirm-provider';
import { appLocale } from '@/lib/locale';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(b.error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserItem {
  id: string; email: string; displayName: string;
  role: string; status: string; avatarKey?: string | null;
  lastLoginAt: string | null; createdAt: string;
}
interface Setting { key: string; value: string; updatedAt: string }

const ROLE_OPTIONS = ['admin', 'manager', 'member', 'guest'] as const;
const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  manager: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
  member: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  guest: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

// ── Members tab ────────────────────────────────────────────────────────────────

function MembersTab() {
  const { t, i18n } = useTranslation('admin');
  const locale = appLocale(i18n.language);
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const confirm = useConfirm();

  // — invite state —
  const [q, setQ] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'manager' | 'member' | 'guest'>('member');
  const [inviteResult, setInviteResult] = useState<{ token: string; email: string } | null>(null);
  const [error, setError] = useState('');

  // — edit-dialog state —
  const [editUser, setEditUser] = useState<UserItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editAvatarKey, setEditAvatarKey] = useState('1');
  const [editRole, setEditRole] = useState('member');
  const [deleteError, setDeleteError] = useState('');

  const { data, isLoading } = useQuery<{ users: UserItem[] }>({
    queryKey: ['admin-users', q],
    queryFn: () => apiFetch(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    staleTime: 30_000,
  });

  const updateUser = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiFetch<UserItem>(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      setEditUser(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      setEditUser(null);
    },
    onError: (err: Error) => setDeleteError(err.message),
  });

  const invite = useMutation({
    mutationFn: () =>
      apiFetch<{ token: string; email: string; invitationId: string }>('/api/admin/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      }),
    onSuccess: (data) => {
      setInviteResult({ token: data.token, email: data.email });
      setInviteEmail('');
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const openEdit = (u: UserItem) => {
    setEditUser(u);
    setEditName(u.displayName);
    setEditAvatarKey(u.avatarKey ?? '1');
    setEditRole(u.role);
    setDeleteError('');
  };

  const handleSave = () => {
    if (!editUser) return;
    updateUser.mutate({
      id: editUser.id,
      body: { displayName: editName, avatarKey: editAvatarKey, role: editRole },
    });
  };

  const handleDelete = async () => {
    if (!editUser) return;
    if (!await confirm({ title: t('users.deleteConfirm') })) return;
    deleteUserMutation.mutate(editUser.id);
  };

  const handleToggleStatus = async (u: UserItem) => {
    if (u.status === 'active') {
      if (!await confirm({ title: t('users.suspendConfirm') })) return;
      updateUser.mutate({ id: u.id, body: { status: 'suspended' } });
    } else {
      updateUser.mutate({ id: u.id, body: { status: 'active' } });
    }
  };

  const users = data?.users ?? [];
  const inviteLink = inviteResult
    ? `${window.location.origin}${BASE}/invite/accept?token=${inviteResult.token}`
    : '';

  return (
    <div className="space-y-6">
      {/* Invite panel */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            {t('users.inviteNew')}
          </h2>
          {!showInvite && (
            <Button size="sm" onClick={() => setShowInvite(true)}>
              <UserPlus className="h-4 w-4 mr-2" /> {t('users.invite')}
            </Button>
          )}
        </div>

        {showInvite && (
          inviteResult ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('users.invitedFor')} <strong>{inviteResult.email}</strong>
              </p>
              <p className="text-xs text-muted-foreground">{t('users.copyLink')}</p>
              <div className="flex gap-2">
                <Input readOnly value={inviteLink} className="text-xs font-mono flex-1" />
                <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(inviteLink)}>
                  {tc('actions.copy')}
                </Button>
              </div>
              <Button size="sm" variant="ghost" onClick={() => { setInviteResult(null); setShowInvite(false); }}>
                {tc('actions.done')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="email"
                placeholder="user@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              >
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{tc(`roles.${r}`)}</option>)}
              </select>
              <Button
                size="sm"
                onClick={() => invite.mutate()}
                disabled={invite.isPending || !inviteEmail.trim()}
              >
                {invite.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {t('users.invite')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowInvite(false)}>
                {tc('actions.cancel')}
              </Button>
            </div>
          )
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {/* Users list */}
      <div className="space-y-3">
        <Input
          placeholder={t('users.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : users.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">{t('users.noUsers')}</div>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 p-3 border rounded-lg bg-card">
                <AvatarBadge name={u.displayName} avatarKey={u.avatarKey} size="sm" />
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{u.displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                </div>
                <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', ROLE_COLORS[u.role])}>
                  {tc(`roles.${u.role}`, { defaultValue: u.role })}
                </span>
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded font-medium',
                  u.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'
                )}>
                  {t(`users.status.${u.status}` as never, { defaultValue: u.status })}
                </span>
                <span className="text-xs text-muted-foreground hidden sm:block shrink-0">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString(locale) : '—'}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {u.status === 'active' ? (
                    <Button
                      size="sm" variant="outline"
                      className="text-yellow-700 border-yellow-300 hover:bg-yellow-50 h-7 text-xs"
                      onClick={() => handleToggleStatus(u)}
                    >
                      {t('users.suspend')}
                    </Button>
                  ) : (
                    <Button
                      size="sm" variant="outline"
                      className="text-green-700 border-green-300 hover:bg-green-50 h-7 text-xs"
                      onClick={() => handleToggleStatus(u)}
                    >
                      {t('users.reactivate')}
                    </Button>
                  )}
                  <Button
                    size="sm" variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => openEdit(u)}
                    title={t('users.editProfile')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => { if (!open) setEditUser(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('users.editProfile')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Avatar */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">{tc('members.changeAvatar')}</Label>
              <AvatarPicker current={editAvatarKey} onChange={setEditAvatarKey} />
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <Label>{t('users.name')}</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t('users.namePlaceholder')}
              />
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <Label>{tc('members.role')}</Label>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{tc(`roles.${r}`)}</option>
                ))}
              </select>
            </div>

            {/* Delete zone */}
            <div className="border-t pt-4 space-y-2">
              {deleteError && <p className="text-xs text-destructive">{deleteError}</p>}
              <Button
                variant="destructive"
                size="sm"
                className="w-full gap-2"
                onClick={handleDelete}
                disabled={deleteUserMutation.isPending}
              >
                {deleteUserMutation.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Trash2 className="h-4 w-4" />}
                {t('users.deleteUser')}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>
              {tc('actions.cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateUser.isPending || !editName.trim()}
            >
              {updateUser.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {tc('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── System tab ─────────────────────────────────────────────────────────────────

function SettingRow({ setting, saved, onSave }: { setting: Setting; saved: boolean; onSave: (v: string) => void }) {
  const [value, setValue] = useState(setting.value);
  const dirty = value !== setting.value;
  return (
    <div className="flex items-center gap-2 p-3 border rounded-lg bg-background">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-mono">{setting.key}</p>
        <Input value={value} onChange={e => setValue(e.target.value)} className="mt-1 h-8 text-sm" />
      </div>
      {saved ? (
        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
      ) : (
        <Button size="sm" variant="outline" onClick={() => onSave(value)} disabled={!dirty} className="shrink-0">
          <Save className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

function SystemTab() {
  const { t } = useTranslation('admin');
  const qc = useQueryClient();
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery<{ settings: Setting[] }>({
    queryKey: ['admin-settings'],
    queryFn: () => apiFetch('/api/admin/settings'),
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: (body: { key: string; value: string }) =>
      apiFetch('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (_d, vars) => {
      setSavedKey(vars.key);
      setTimeout(() => setSavedKey(''), 2000);
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const settings = data?.settings ?? [];

  return (
    <div className="space-y-4">
      {error && <p className="text-destructive text-sm">{error}</p>}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {settings.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">{t('settings.addUpdate')}</p>
          )}
          {settings.map((s) => (
            <SettingRow
              key={s.key}
              setting={s}
              saved={savedKey === s.key}
              onSave={(value) => save.mutate({ key: s.key, value })}
            />
          ))}
          <div className="border-t pt-4 mt-4">
            <h3 className="text-sm font-medium mb-2">{t('settings.addUpdate')}</h3>
            <div className="flex gap-2">
              <Input placeholder={t('settings.key')} value={newKey} onChange={e => setNewKey(e.target.value)} className="flex-1" />
              <Input placeholder={t('settings.value')} value={newVal} onChange={e => setNewVal(e.target.value)} className="flex-1" />
              <Button
                size="sm"
                onClick={() => { save.mutate({ key: newKey, value: newVal }); setNewKey(''); setNewVal(''); }}
                disabled={!newKey || save.isPending}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

type Tab = 'members' | 'system';

export default function SettingsPage() {
  const { t } = useTranslation('common');
  const [tab, setTab] = useState<Tab>('members');

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'members', label: t('settings.members'), icon: Users },
    { id: 'system', label: t('settings.system'), icon: Settings },
  ];

  return (
    <div className="flex-1 p-6 md:p-10 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('nav.settings')}</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
              tab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'members' ? <MembersTab /> : <SystemTab />}
    </div>
  );
}

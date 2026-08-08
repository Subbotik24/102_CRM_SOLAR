/**
 * Admin — User Management page.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError, getListAdminUsersQueryKey, useCreateAdminPasswordResetLink, useCreateInvitation, useListAdminUsers, useUpdateAdminUser } from '@workspace/api-client-react';
import { Users, UserPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { AvatarBadge } from '@/components/ui/avatar-badge';
import { useConfirm } from '@/components/confirm-provider';
import { appLocale } from '@/lib/locale';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const ROLE_OPTIONS = ['admin', 'manager', 'member', 'guest'] as const;
const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-800',
  manager: 'bg-purple-100 text-purple-800',
  member: 'bg-blue-100 text-blue-800',
  guest: 'bg-gray-100 text-gray-600',
};

export default function AdminUsersPage() {
  const { t, i18n } = useTranslation('admin');
  const locale = appLocale(i18n.language);
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'manager' | 'member' | 'guest'>('member');
  const [inviteLocale, setInviteLocale] = useState<'uk' | 'cs'>('uk');
  const [inviteResult, setInviteResult] = useState<{ token?: string; email: string; delivery: 'console' | 'smtp' } | null>(null);
  const [error, setError] = useState('');
  const [resetLink, setResetLink] = useState<{ token?: string; delivery: 'console' | 'smtp' } | null>(null);

  const { data, isLoading } = useListAdminUsers(q ? { q } : undefined, {
    query: { queryKey: getListAdminUsersQueryKey(q ? { q } : undefined), staleTime: 30_000 },
  });

  const updateUser = useUpdateAdminUser({ mutation: {
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/api/admin/users'] }),
    onError: (err: ApiError) => setError(err.message),
  },
  });

  const invite = useCreateInvitation({ mutation: {
    onSuccess: (data) => {
      setInviteResult({ ...data, email: inviteEmail });
      setInviteEmail('');
      qc.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (err: ApiError) => setError(err.message),
  },
  });

  const users = data?.users ?? [];
  const inviteLink = inviteResult?.token ? `${window.location.origin}${BASE}/invite/accept?token=${inviteResult.token}` : '';

  const resetLinkMutation = useCreateAdminPasswordResetLink({ mutation: {
    onSuccess: (data) => setResetLink(data),
    onError: (err: ApiError) => setError(err.message),
  },
  });

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <h1 className="text-xl font-semibold">{t('users.title')}</h1>
          <span className="text-sm text-muted-foreground">({users.length})</span>
        </div>
        <Button onClick={() => setShowInvite(!showInvite)} size="sm">
          <UserPlus className="h-4 w-4 mr-2" /> {t('users.invite')}
        </Button>
      </div>

      {/* Invite panel */}
      {showInvite && (
        <div className="mb-6 p-4 border rounded-lg bg-muted/30">
          <h2 className="font-medium mb-3">{t('users.inviteNew')}</h2>
          {inviteResult ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {t('users.invitedFor')} <strong>{inviteResult.email}</strong>
              </p>
              {inviteResult.token ? <>
                <p className="text-xs text-muted-foreground">{t('users.copyLink')}</p>
                <div className="flex gap-2">
                  <Input readOnly value={inviteLink} className="text-xs font-mono flex-1" />
                  <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(inviteLink)}>
                    {tc('actions.copy')}
                  </Button>
                </div>
              </> : <p className="text-xs text-muted-foreground">{t('users.emailSent')}</p>}
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
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{tc(`roles.${r}`)}</option>
                ))}
              </select>
              <select value={inviteLocale} onChange={(e) => setInviteLocale(e.target.value as typeof inviteLocale)} className="rounded-md border bg-background px-3 py-2 text-sm" aria-label="Invitation language">
                <option value="uk">Українська</option>
                <option value="cs">Čeština</option>
              </select>
              <Button
                size="sm"
                onClick={() => invite.mutate({ data: { email: inviteEmail, role: inviteRole, locale: inviteLocale } })}
                disabled={invite.isPending || !inviteEmail.trim()}
              >
                {invite.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {t('users.invite')}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <Input
        placeholder={t('users.searchPlaceholder')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-4"
      />

      {error && <p className="text-destructive text-sm mb-3">{error}</p>}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : users.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground text-sm">{t('users.noUsers')}</div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 p-3 border rounded-lg bg-card">
              {/* Avatar + name */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <AvatarBadge name={u.displayName} avatarKey={u.avatarKey} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{u.displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
              </div>

              {/* Role select */}
              <select
                value={u.role}
                onChange={(e) => updateUser.mutate({ id: u.id, data: { role: e.target.value as typeof inviteRole } })}
                className={cn(
                  'text-xs font-medium px-2 py-1 rounded border bg-background',
                  ROLE_COLORS[u.role] ?? ''
                )}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{tc(`roles.${r}`)}</option>
                ))}
              </select>

              {/* Status badge */}
              <span className={cn(
                'text-xs px-2 py-0.5 rounded font-medium',
                u.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
              )}>
                {t(`users.status.${u.status}` as never, { defaultValue: u.status })}
              </span>

              {/* Last login */}
              <div className="text-xs text-muted-foreground">
                {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString(locale) : '—'}
              </div>

              {/* Actions */}
              <div>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => resetLinkMutation.mutate({ id: u.id })}>
                  {t('users.resetLink')}
                </Button>
                {u.status === 'active' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-yellow-700 border-yellow-300 hover:bg-yellow-50 h-7 text-xs"
                    onClick={() => {
                      void confirm({ title: t('users.suspendConfirm') }).then((accepted) => {
                        if (accepted) updateUser.mutate({ id: u.id, data: { status: 'suspended' } });
                      });
                    }}
                  >
                    {t('users.suspend')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-green-700 border-green-300 hover:bg-green-50 h-7 text-xs"
                    onClick={() => updateUser.mutate({ id: u.id, data: { status: 'active' } })}
                  >
                    {t('users.reactivate')}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {resetLink ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl space-y-3 rounded-lg bg-background p-5 shadow-xl">
            <h2 className="font-semibold">{t('users.resetLinkTitle')}</h2>
            <p className="text-sm text-muted-foreground">{resetLink.token ? t('users.resetLinkHint') : t('users.emailSent')}</p>
            {resetLink.token ? <div className="flex gap-2"><Input readOnly value={`${window.location.origin}${BASE}/reset-password?token=${resetLink.token}`} className="font-mono text-xs" /><Button onClick={() => navigator.clipboard.writeText(`${window.location.origin}${BASE}/reset-password?token=${resetLink.token}`)}>{tc('actions.copy')}</Button></div> : null}
            <Button variant="outline" onClick={() => setResetLink(null)}>{tc('actions.done')}</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

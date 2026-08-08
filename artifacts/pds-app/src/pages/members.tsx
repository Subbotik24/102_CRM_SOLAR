/**
 * Members page — lists all system users with their project memberships.
 */
import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Users, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AvatarBadge, AvatarPicker } from '@/components/ui/avatar-badge';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  });
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

interface SystemUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  avatarKey?: string | null;
  lastLoginAt: string | null;
}

interface ProjectMember {
  userId: string;
  role: string;
  projectId: string;
  projectName: string;
  projectCode: string;
}

const ROLE_COLORS: Record<string, string> = {
  admin:   'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  manager: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
  member:  'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  guest:   'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

export default function MembersPage() {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [pickerUserId, setPickerUserId] = useState<string | null>(null);

  const { data: usersData, isLoading: usersLoading } = useQuery<{ users: SystemUser[] }>({
    queryKey: ['admin-users'],
    queryFn: () => apiFetch('/api/admin/users'),
    staleTime: 60_000,
  });

  const { data: membersData } = useQuery<{ members: ProjectMember[] }>({
    queryKey: ['all-members'],
    queryFn: () => apiFetch('/api/projects/members/all'),
    staleTime: 60_000,
  });

  const updateAvatarMutation = useMutation({
    mutationFn: ({ userId, avatarKey }: { userId: string; avatarKey: string }) =>
      apiFetch(`/api/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ avatarKey }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setPickerUserId(null);
    },
  });

  const users = usersData?.users ?? [];
  const projectMembers = membersData?.members ?? [];

  const projectsByUser = new Map<string, { id: string; name: string; code: string; role: string }[]>();
  for (const m of projectMembers) {
    if (!projectsByUser.has(m.userId)) projectsByUser.set(m.userId, []);
    projectsByUser.get(m.userId)!.push({ id: m.projectId, name: m.projectName, code: m.projectCode, role: m.role });
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b bg-background/95 px-5 py-5 backdrop-blur md:px-8 lg:px-10">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary shrink-0" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('members.pageTitle')}</h1>
            <p className="text-sm text-muted-foreground">{t('members.pageSubtitle')}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 md:px-10 py-6 space-y-2">
        {usersLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center space-y-3">
            <Users className="h-10 w-10 text-muted-foreground mx-auto opacity-40" />
            <p className="text-muted-foreground">{t('members.noMembers')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {users.map((user) => {
              const projects = projectsByUser.get(user.id) ?? [];
              const showPicker = pickerUserId === user.id;
              return (
                <div key={user.id} className="rounded-lg border bg-card px-5 py-4">
                  <div className="flex items-center gap-4">
                    <AvatarBadge
                      name={user.displayName}
                      avatarKey={user.avatarKey}
                      size="sm"
                      onClick={() => setPickerUserId(showPicker ? null : user.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">{user.displayName}</p>
                        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', ROLE_COLORS[user.role])}>
                          {t(`roles.${user.role}`, { defaultValue: user.role })}
                        </span>
                        {user.status !== 'active' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
                            {user.status}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{user.email}</p>

                      {showPicker && (
                        <div className="mt-3 p-3 rounded-lg bg-muted/50 border">
                          <p className="text-xs text-muted-foreground mb-2">
                            {t('members.changeAvatar', { defaultValue: 'Змінити аватар:' })}
                          </p>
                          <AvatarPicker
                            current={user.avatarKey ?? '1'}
                            onChange={(key) => updateAvatarMutation.mutate({ userId: user.id, avatarKey: key })}
                          />
                        </div>
                      )}

                      {projects.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {projects.map((p) => (
                            <span
                              key={p.id}
                              onClick={() => navigate(`/projects/${p.id}`)}
                              className="inline-flex items-center gap-1 text-xs bg-muted hover:bg-accent px-2 py-0.5 rounded-full border cursor-pointer transition-colors"
                            >
                              <span className="font-mono text-muted-foreground">{p.code}</span>
                              <span className="text-foreground">{p.name}</span>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-primary">{t(`roles.${p.role}`, { defaultValue: p.role })}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

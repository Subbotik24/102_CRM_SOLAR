/**
 * Admin — Audit Log viewer.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: 'include' });
  if (!res.ok) throw new Error(res.statusText);
  return res.json() as Promise<T>;
}

interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  meta: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

const ACTION_COLORS: Record<string, string> = {
  'auth.login_success': 'text-green-700',
  'auth.login_failure': 'text-red-700',
  'user.suspended': 'text-yellow-700',
  'user.role_changed': 'text-blue-700',
  'permission.denied': 'text-red-600',
  'settings.changed': 'text-purple-700',
};

export default function AdminAuditLogPage() {
  const { t, i18n } = useTranslation('admin');
  const locale = i18n.language === 'cs' ? 'cs-CZ' : 'uk-UA';
  const [action, setAction] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const limit = 50;

  const params = new URLSearchParams();
  if (action) params.set('action', action);
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  params.set('limit', String(limit));
  params.set('offset', String(page * limit));

  const { data, isLoading } = useQuery<{ logs: AuditEntry[]; total: number }>({
    queryKey: ['audit-log', action, dateFrom, dateTo, page],
    queryFn: () => apiFetch(`/api/admin/audit-log?${params}`),
    staleTime: 15_000,
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          <h1 className="text-xl font-semibold">{t('auditLog.title')}</h1>
          <span className="text-sm text-muted-foreground">({total})</span>
        </div>
        <a
          href={`${BASE}/api/admin/audit-log.csv`}
          className="inline-flex items-center gap-2 px-3 py-1.5 border rounded text-sm hover:bg-muted/60 transition-colors"
        >
          <Download className="h-4 w-4" /> {t('auditLog.exportCsv')}
        </a>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <Input
          placeholder={t('auditLog.filterPlaceholder')}
          value={action}
          onChange={e => { setAction(e.target.value); setPage(0); }}
          className="flex-1"
        />
        <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }} className="w-full sm:w-40" />
        <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }} className="w-full sm:w-40" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : logs.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground text-sm">{t('auditLog.noEvents')}</div>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                  <th className="text-left px-3 py-2 whitespace-nowrap">{t('auditLog.columns.time')}</th>
                  <th className="text-left px-3 py-2 whitespace-nowrap">{t('auditLog.columns.actor')}</th>
                  <th className="text-left px-3 py-2 whitespace-nowrap">{t('auditLog.columns.action')}</th>
                  <th className="text-left px-3 py-2 whitespace-nowrap">{t('auditLog.columns.entity')}</th>
                  <th className="text-left px-3 py-2 whitespace-nowrap">{t('auditLog.columns.ip')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((e) => (
                  <tr key={e.id} className="border-t hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(e.created_at).toLocaleString(locale)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {e.actor_name ?? <span className="text-muted-foreground italic">{t('auditLog.system')}</span>}
                    </td>
                    <td className={`px-3 py-2 font-mono text-xs whitespace-nowrap ${ACTION_COLORS[e.action] ?? ''}`}>{e.action}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {e.entity_type && <span>{e.entity_type}</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{e.ip_address ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center mt-4 text-sm">
            <span className="text-muted-foreground">
              {t('auditLog.showing')} {page * limit + 1}–{Math.min((page + 1) * limit, total)} {t('auditLog.of')} {total}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
                {t('auditLog.previous')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * limit >= total}>
                {t('auditLog.next')}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

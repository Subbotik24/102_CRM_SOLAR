/**
 * Admin — Settings page.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError, getListAdminSettingsQueryKey, useListAdminSettings, useUpdateAdminSetting } from '@workspace/api-client-react';
import { Settings, Save, Loader2, Plus, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Setting { key: string; value: string; updatedAt?: string }

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

export default function AdminSettingsPage() {
  const { t } = useTranslation('admin');
  const qc = useQueryClient();
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [error, setError] = useState('');

  const { data, isLoading } = useListAdminSettings({
    query: { queryKey: getListAdminSettingsQueryKey(), staleTime: 30_000 },
  });

  const save = useUpdateAdminSetting({
    mutation: {
    onSuccess: (_d, vars) => {
      setSavedKey(vars.data.key);
      setTimeout(() => setSavedKey(''), 2000);
      qc.invalidateQueries({ queryKey: getListAdminSettingsQueryKey() });
    },
    onError: (err: ApiError) => setError(err.message),
    },
  });

  const settings = data?.settings ?? [];


  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="h-5 w-5" />
        <h1 className="text-xl font-semibold">{t('settings.title')}</h1>
      </div>

      {error && <p className="text-destructive text-sm mb-3">{error}</p>}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {settings.map((s) => (
            <SettingRow
              key={s.key}
              setting={s}
              saved={savedKey === s.key}
              onSave={(value) => save.mutate({ data: { key: s.key, value } })}
            />
          ))}

          <div className="border-t pt-4 mt-4">
            <h2 className="text-sm font-medium mb-2">{t('settings.addUpdate')}</h2>
            <div className="flex gap-2">
              <Input placeholder={t('settings.key')} value={newKey} onChange={e => setNewKey(e.target.value)} className="flex-1" />
              <Input placeholder={t('settings.value')} value={newVal} onChange={e => setNewVal(e.target.value)} className="flex-1" />
              <Button
                size="sm"
                onClick={() => { save.mutate({ data: { key: newKey, value: newVal } }); setNewKey(''); setNewVal(''); }}
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

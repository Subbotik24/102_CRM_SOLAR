import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, getListLibraryItemsQueryKey, useCreateLibraryItem, useDeleteLibraryItem, useListLibraryItems, useUpdateLibraryItem } from '@workspace/api-client-react';
import {
  Library, Plus, Loader2, FileText, Scale, BookOpen,
  Package, BarChart2, File, Trash2, ExternalLink, Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface LibraryItem {
  id: string; title: string; description?: string | null;
  category: string; url?: string | null; addedById?: string | null;
  createdAt: string;
}

type Category = { key: string; icon: React.ElementType; color: string; bg: string };

const CATEGORIES: Category[] = [
  { key: 'all',         icon: Library,   color: 'text-foreground',       bg: 'bg-muted' },
  { key: 'template',    icon: FileText,  color: 'text-blue-500',         bg: 'bg-blue-500/10' },
  { key: 'standard',    icon: Scale,     color: 'text-emerald-500',      bg: 'bg-emerald-500/10' },
  { key: 'instruction', icon: BookOpen,  color: 'text-violet-500',       bg: 'bg-violet-500/10' },
  { key: 'material',    icon: Package,   color: 'text-orange-500',       bg: 'bg-orange-500/10' },
  { key: 'report',      icon: BarChart2, color: 'text-rose-500',         bg: 'bg-rose-500/10' },
  { key: 'other',       icon: File,      color: 'text-muted-foreground', bg: 'bg-muted' },
];

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

function CategoryIcon({ category, size = 'sm' }: { category: string; size?: 'sm' | 'md' }) {
  const cat = CATEGORY_MAP[category] ?? CATEGORY_MAP['other'];
  const Icon = cat.icon;
  const sz = size === 'md' ? 'h-5 w-5' : 'h-4 w-4';
  return (
    <div className={cn('rounded-lg flex items-center justify-center shrink-0',
      size === 'md' ? 'h-10 w-10' : 'h-7 w-7', cat.bg)}>
      <Icon className={cn(sz, cat.color)} />
    </div>
  );
}

export default function LibraryPage() {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();
  const [activeCategory, setActiveCategory] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<LibraryItem | null>(null);

  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCat, setFormCat] = useState('other');
  const [formUrl, setFormUrl] = useState('');
  const [formError, setFormError] = useState('');

  const openCreate = () => {
    setEditItem(null);
    setFormTitle(''); setFormDesc('');
    setFormCat(activeCategory !== 'all' ? activeCategory : 'other');
    setFormUrl(''); setFormError('');
    setDialogOpen(true);
  };
  const openEdit = (item: LibraryItem) => {
    setEditItem(item);
    setFormTitle(item.title); setFormDesc(item.description ?? '');
    setFormCat(item.category); setFormUrl(item.url ?? ''); setFormError('');
    setDialogOpen(true);
  };

  const { data, isLoading } = useListLibraryItems(undefined, {
    query: { queryKey: getListLibraryItemsQueryKey(), staleTime: 30_000 },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListLibraryItemsQueryKey() });
  const createMutation = useCreateLibraryItem({ mutation: { onSuccess: () => { invalidate(); setDialogOpen(false); }, onError: (err: ApiError) => setFormError(err.message) } });
  const updateMutation = useUpdateLibraryItem({ mutation: { onSuccess: () => { invalidate(); setDialogOpen(false); }, onError: (err: ApiError) => setFormError(err.message) } });

  const deleteMutation = useDeleteLibraryItem({ mutation: { onSuccess: invalidate } });

  const allItems = data?.items ?? [];
  const filtered = activeCategory === 'all' ? allItems : allItems.filter(i => i.category === activeCategory);
  const counts = Object.fromEntries(CATEGORIES.slice(1).map(c => [c.key, allItems.filter(i => i.category === c.key).length]));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;
    const data = { title: formTitle.trim(), description: formDesc.trim() || undefined, category: formCat as 'template' | 'standard' | 'instruction' | 'material' | 'report' | 'other', url: formUrl.trim() || undefined };
    if (editItem) updateMutation.mutate({ id: editItem.id, data });
    else createMutation.mutate({ data });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* ── Page header ── */}
      <div className="shrink-0 border-b bg-background/95 px-5 py-5 backdrop-blur md:px-8 lg:px-10">
        <div className="flex items-center gap-3">
          <Library className="h-6 w-6 text-primary shrink-0" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t('library.title', { defaultValue: 'Бібліотека' })}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('library.subtitle', { defaultValue: 'Робочі документи, шаблони та стандарти команди' })}
            </p>
          </div>
          <div className="ml-auto">
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              {t('library.addItem', { defaultValue: 'Додати' })}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Category filter ── */}
      <div className="px-6 md:px-10 py-3 border-b shrink-0 flex gap-1.5 overflow-x-auto">
        {CATEGORIES.map(cat => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.key;
          const cnt = cat.key === 'all' ? allItems.length : (counts[cat.key] ?? 0);
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(`library.cat.${cat.key}`, { defaultValue: cat.key })}
              {cnt > 0 && <span className={isActive ? 'opacity-70' : 'opacity-60'}>{cnt}</span>}
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-6 md:px-10 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center space-y-3">
            <Library className="h-10 w-10 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">
              {t('library.empty', { defaultValue: 'У цій категорії документів ще немає' })}
            </p>
            <Button variant="outline" size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              {t('library.addFirst', { defaultValue: 'Додати перший' })}
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map(item => {
              const cat = CATEGORY_MAP[item.category] ?? CATEGORY_MAP['other'];
              return (
                <div
                  key={item.id}
                  className="group rounded-lg border bg-card p-4 flex flex-col gap-3 hover:bg-accent/40 hover:border-primary/20 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <CategoryIcon category={item.category} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm leading-tight text-foreground">{item.title}</p>
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{t(`library.cat.${cat.key}`, { defaultValue: cat.key })}</span>
                    </div>
                    {/* Hover actions */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(item)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="h-7 w-7 flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMutation.mutate({ id: item.id })}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {item.description && (
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                      {item.description}
                    </p>
                  )}

                  {item.url && (
                    <div className="mt-auto pt-1">
                      <a href={item.url} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs h-8">
                          <ExternalLink className="h-3.5 w-3.5" />
                          {t('library.open', { defaultValue: 'Відкрити' })}
                        </Button>
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add / Edit dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editItem
                ? t('library.editItem', { defaultValue: 'Редагувати документ' })
                : t('library.addItem', { defaultValue: 'Додати документ' })}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('library.fields.title', { defaultValue: 'Назва' })}</Label>
              <Input value={formTitle} onChange={e => setFormTitle(e.target.value)}
                placeholder={t('library.fields.titlePlaceholder', { defaultValue: 'Напр. Шаблон договору' })}
                autoFocus required />
            </div>
            <div className="space-y-2">
              <Label>{t('library.fields.category', { defaultValue: 'Категорія' })}</Label>
              <select value={formCat} onChange={e => setFormCat(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                {CATEGORIES.slice(1).map(c => <option key={c.key} value={c.key}>{t(`library.cat.${c.key}`, { defaultValue: c.key })}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t('library.fields.description', { defaultValue: 'Опис' })}</Label>
              <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)}
                placeholder={t('library.fields.descriptionPlaceholder', { defaultValue: 'Короткий опис документу…' })}
                rows={3} className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none" />
            </div>
            <div className="space-y-2">
              <Label>{t('library.fields.url', { defaultValue: 'Посилання (необовʼязково)' })}</Label>
              <Input type="url" value={formUrl} onChange={e => setFormUrl(e.target.value)}
                placeholder="https://docs.google.com/…" />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t('actions.cancel')}
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending || !formTitle.trim()}>
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editItem ? t('actions.save') : t('actions.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

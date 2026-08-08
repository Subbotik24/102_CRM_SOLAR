/**
 * Knowledge Base page — tree navigation + article view with Markdown editor.
 * Route: /projects/:id/kb and /projects/:id/kb/:articleId
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, ChevronRight, ChevronDown, Plus, Tag, Clock,
  Edit3, Eye, Archive, UploadCloud, Loader2, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { appLocale } from '@/lib/locale';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface Article {
  id: string;
  projectId: string;
  parentId: string | null;
  path: string;
  depth: number;
  title: string;
  bodyMd: string;
  bodyHtml: string;
  tags: string[];
  status: 'draft' | 'published' | 'archived';
  createdAt: string;
  updatedAt: string;
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: opts?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function buildTree(articles: Article[]): Array<Article & { children: Article[] }> {
  const map = new Map<string, Article & { children: Article[] }>();
  const roots: Array<Article & { children: Article[] }> = [];

  for (const a of articles) {
    map.set(a.id, { ...a, children: [] });
  }
  for (const a of articles) {
    const node = map.get(a.id)!;
    if (a.parentId && map.has(a.parentId)) {
      map.get(a.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

type TreeNode = Article & { children: TreeNode[] };

function ArticleNode({
  node, selected, onSelect, indent = 0,
}: {
  node: TreeNode;
  selected: string | null;
  onSelect: (id: string) => void;
  indent?: number;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;
  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer text-sm hover:bg-accent/60',
          selected === node.id && 'bg-accent font-medium'
        )}
        style={{ paddingLeft: `${8 + indent * 16}px` }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setOpen((p) => !p); }}
            className="text-muted-foreground"
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        <span className="truncate flex-1">{node.title}</span>
        {node.status === 'draft' && (
          <span className="text-xs text-amber-500 font-medium">{/* draft label rendered inline */}</span>
        )}
      </div>
      {open && hasChildren && node.children.map((child) => (
        <ArticleNode key={child.id} node={child as TreeNode} selected={selected} onSelect={onSelect} indent={indent + 1} />
      ))}
    </div>
  );
}

function ArticleView({ article, projectId }: { article: Article; projectId: string }) {
  const { t, i18n } = useTranslation('kb');
  const locale = appLocale(i18n.language);
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [draft, setDraft] = useState({ title: article.title, bodyMd: article.bodyMd, tags: article.tags.join(', ') });

  const updateMut = useMutation({
    mutationFn: (data: { title?: string; bodyMd?: string; tags?: string[] }) =>
      apiFetch(`/api/kb/${article.id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['kb', projectId] }); setEditing(false); },
  });

  const publishMut = useMutation({
    mutationFn: () => apiFetch(`/api/kb/${article.id}/publish`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kb', projectId] }),
  });

  const archiveMut = useMutation({
    mutationFn: () => apiFetch(`/api/kb/${article.id}/archive`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kb', projectId] }),
  });

  const { data: versions } = useQuery<{ versions: Array<{ id: string; versionNo: number; createdAt: string }> }>({
    queryKey: ['kb-versions', article.id],
    queryFn: () => apiFetch(`/api/kb/${article.id}/versions`),
  });

  if (editing) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b">
          <Input
            value={draft.title}
            onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
            className="text-lg font-semibold flex-1"
            placeholder={t('fields.title')}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setTab('edit')} className={tab === 'edit' ? 'bg-accent' : ''}>
              <Edit3 className="h-3 w-3 mr-1" />{t('edit')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setTab('preview')} className={tab === 'preview' ? 'bg-accent' : ''}>
              <Eye className="h-3 w-3 mr-1" />{t('preview')}
            </Button>
          </div>
          <Button size="sm" onClick={() => updateMut.mutate({ title: draft.title, bodyMd: draft.bodyMd, tags: draft.tags.split(',').map((t) => t.trim()).filter(Boolean) })} disabled={updateMut.isPending}>
            {updateMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}{t('actions.save', {ns:'common'})}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>{t('actions.cancel', {ns:'common'})}</Button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-4">
          <Input
            value={draft.tags}
            onChange={(e) => setDraft((p) => ({ ...p, tags: e.target.value }))}
            placeholder={t('fields.tagsPlaceholder')}
            className="mb-3 text-sm"
          />
          {tab === 'edit' ? (
            <Textarea
              value={draft.bodyMd}
              onChange={(e) => setDraft((p) => ({ ...p, bodyMd: e.target.value }))}
              className="min-h-[400px] font-mono text-sm"
              placeholder={t('fields.bodyPlaceholder')}
            />
          ) : (
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: article.bodyHtml }}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{article.title}</h1>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className={cn(
              'px-2 py-0.5 rounded-full font-medium',
              article.status === 'published' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' :
              article.status === 'draft' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' :
              'bg-muted text-muted-foreground'
            )}>{t(`status.${article.status}`, { defaultValue: article.status })}</span>
            <Clock className="h-3 w-3" />
            <span>{t('updated')} {new Date(article.updatedAt).toLocaleDateString(locale)}</span>
            {versions && versions.versions.length > 1 && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                v{versions.versions[0]?.versionNo}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Edit3 className="h-3 w-3 mr-1" />{t('edit')}
          </Button>
          {article.status === 'draft' && (
            <Button size="sm" onClick={() => publishMut.mutate()} disabled={publishMut.isPending}>
              <UploadCloud className="h-3 w-3 mr-1" />{t('publish')}
            </Button>
          )}
          {article.status !== 'archived' && (
            <Button size="sm" variant="outline" onClick={() => archiveMut.mutate()} disabled={archiveMut.isPending}>
              <Archive className="h-3 w-3 mr-1" />{t('archive')}
            </Button>
          )}
        </div>
      </div>

      {article.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 px-6 pt-4">
          {article.tags.map((tag) => (
            <span key={tag} className="flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded-full">
              <Tag className="h-2.5 w-2.5" />{tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto px-6 py-4">
        {article.bodyHtml ? (
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: article.bodyHtml }}
          />
        ) : (
          <p className="text-muted-foreground italic">{t('noContent')}</p>
        )}
      </div>
    </div>
  );
}

export default function KbPage() {
  const { t } = useTranslation('kb');
  const { id: projectId } = useParams<{ id: string }>();
  const [location] = useLocation();
  const qc = useQueryClient();
  // Support ?article=<id> from search results
  const searchParams = new URLSearchParams(location.includes('?') ? location.split('?')[1] : '');
  const preSelectedId = searchParams.get('article');
  const [selectedId, setSelectedId] = useState<string | null>(preSelectedId);
  const [tagFilter, setTagFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const { data, isLoading } = useQuery<{ articles: Article[] }>({
    queryKey: ['kb', projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/kb`),
  });

  const createMut = useMutation({
    mutationFn: (title: string) =>
      apiFetch(`/api/projects/${projectId}/kb`, { method: 'POST', body: JSON.stringify({ title }) }),
    onSuccess: (article) => {
      qc.invalidateQueries({ queryKey: ['kb', projectId] });
      setSelectedId((article as Article).id);
      setCreating(false);
      setNewTitle('');
    },
  });

  const articles = data?.articles ?? [];
  const filtered = tagFilter
    ? articles.filter((a) => a.tags.some((t) => t.toLowerCase().includes(tagFilter.toLowerCase())))
    : articles;
  const tree = buildTree(filtered) as TreeNode[];
  const selected = articles.find((a) => a.id === selectedId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-60">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar — tree */}
      <div className="w-64 shrink-0 border-r flex flex-col overflow-hidden bg-muted/20">
        <div className="px-3 py-3 border-b">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <BookOpen className="h-4 w-4" />{t('title')}
            </div>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Input
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            placeholder={t('filterByTag')}
            className="h-7 text-xs"
          />
        </div>

        {creating && (
          <div className="px-3 py-2 border-b flex gap-2">
            <Input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={t('fields.title')}
              className="h-7 text-xs flex-1"
              onKeyDown={(e) => { if (e.key === 'Enter' && newTitle.trim()) createMut.mutate(newTitle.trim()); }}
            />
            <Button size="sm" className="h-7 text-xs" disabled={!newTitle.trim() || createMut.isPending}
              onClick={() => createMut.mutate(newTitle.trim())}>
              {createMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : t('newArticle')}
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-1">
          {tree.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              {tagFilter ? t('noMatch') : t('noArticles')}
            </p>
          ) : (
            tree.map((node) => (
              <ArticleNode key={node.id} node={node} selected={selectedId} onSelect={setSelectedId} />
            ))
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <ArticleView article={selected} projectId={projectId} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>{t('selectArticle')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

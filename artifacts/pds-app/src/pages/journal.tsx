/**
 * Journal page — vertical timeline with collapsing, filters, and chronicle export.
 * Route: /projects/:id/journal
 */
import { useState } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, BookOpen, Loader2, ChevronDown, ChevronRight,
  Flag, Target, AlertTriangle, StickyNote, Download, Plus, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// ── Types ─────────────────────────────────────────────────────────────────────

interface JournalEvent {
  id: string;
  kind: 'activity' | 'log_entry';
  projectId: string | null;
  entityType: string;
  entityId: string;
  actorId: string;
  actorName: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  collapsed?: boolean;
  collapsedItems?: JournalEvent[];
}

interface JournalPage {
  events: JournalEvent[];
  nextCursor: string | null;
}

interface Project { id: string; code: string; name: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: opts?.body ? { 'Content-Type': 'application/json' } : {},
    ...opts,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatMonth(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

const LOG_ENTRY_META: Record<string, { labelKey: string; color: string; Icon: React.ComponentType<{ className?: string }> }> = {
  'log.decision':  { labelKey: 'logEntry.types.decision',  color: 'border-l-blue-500 bg-blue-50 dark:bg-blue-950/30',   Icon: Flag },
  'log.milestone': { labelKey: 'logEntry.types.milestone', color: 'border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/30', Icon: Target },
  'log.risk':      { labelKey: 'logEntry.types.risk',      color: 'border-l-amber-500 bg-amber-50 dark:bg-amber-950/30',   Icon: AlertTriangle },
  'log.note':      { labelKey: 'logEntry.types.note',      color: 'border-l-muted bg-muted/40',                            Icon: StickyNote },
};

const PROMINENT_TYPES = new Set(['log.decision', 'log.milestone']);

// ── Event row ─────────────────────────────────────────────────────────────────

function EventRow({ event, t, locale }: { event: JournalEvent; t: (key: string, opts?: Record<string, string>) => string; locale: string }) {
  const { t: tj } = useTranslation('journal');
  const { t: tTasks } = useTranslation('tasks');
  const { t: tProjects } = useTranslation('projects');
  const [expanded, setExpanded] = useState(false);
  const meta = LOG_ENTRY_META[event.eventType];
  const payload = event.payload as Record<string, string | undefined>;

  const statusLabel = (code: string | undefined) => {
    if (!code) return '';
    if (event.eventType === 'task.status_changed') return tTasks(`status.${code}` as Parameters<typeof tTasks>[0], { defaultValue: code });
    if (event.eventType === 'project.status_changed') return tProjects(`status.${code}` as Parameters<typeof tProjects>[0], { defaultValue: code });
    return code;
  };

  const sentence = meta
    ? `${tj(meta.labelKey as Parameters<typeof tj>[0])}: ${(payload.title as string) ?? event.eventType}`
    : t(event.eventType as Parameters<typeof t>[0], {
        actorName: event.actorName,
        projectName: payload.projectName ?? payload.projectCode ?? '',
        taskTitle: payload.taskTitle ?? payload.taskCode ?? '',
        from: statusLabel(payload.from),
        to: statusLabel(payload.to),
        stageName: payload.stageName ?? '',
        memberName: payload.memberName ?? '',
        assigneeName: payload.assigneeName ?? '',
        fileName: payload.fileName ?? '',
        title: payload.title ?? '',
      });

  const isProminent = PROMINENT_TYPES.has(event.eventType);
  const isCollapsed = event.collapsed && event.collapsedItems && event.collapsedItems.length > 1;
  const Icon = meta?.Icon;

  return (
    <li className={cn("ml-6 relative", isProminent && "scale-[1.01]")}>
      <div
        className={cn(
          "absolute -left-[9px] w-4 h-4 rounded-full border-2 border-background",
          isProminent ? "bg-primary" : "bg-border"
        )}
      />
      <div
        className={cn(
          "rounded-lg border px-4 py-3 space-y-1",
          meta ? `border-l-4 ${meta.color}` : "bg-card",
          isCollapsed && "cursor-pointer hover:bg-accent/30"
        )}
        onClick={isCollapsed ? () => setExpanded((p) => !p) : undefined}
      >
        <div className="flex items-start gap-2">
          {Icon && <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />}
          <p
            className={cn("text-sm text-foreground leading-relaxed flex-1", isProminent && "font-semibold")}
            data-testid="journal-event-sentence"
          >
            {sentence}
            {isCollapsed && (
              <span className="ml-2 text-xs text-muted-foreground">
                +{event.collapsedItems!.length - 1} {tj('similar')}
                {expanded ? <ChevronDown className="inline h-3 w-3 ml-1" /> : <ChevronRight className="inline h-3 w-3 ml-1" />}
              </span>
            )}
          </p>
        </div>
        {meta && payload.bodyMd && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{payload.bodyMd as string}</p>
        )}
        <p className="text-xs text-muted-foreground font-mono">{formatDate(event.createdAt, locale)}</p>

        {/* Expanded collapsed items */}
        {isCollapsed && expanded && (
          <div className="mt-2 border-t pt-2 space-y-1.5">
            {event.collapsedItems!.slice(1).map((sub) => (
              <div key={sub.id} className="text-xs text-muted-foreground pl-2 border-l">
                {formatDate(sub.createdAt, locale)} — {sub.actorName}
              </div>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

// ── Chronicle export dialog ───────────────────────────────────────────────────

function ChronicleDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { t: tj } = useTranslation('journal');
  const { toast } = useToast();
  const [format, setFormat] = useState<'md' | 'pdf'>('md');
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/projects/${projectId}/chronicle?format=${format}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chronicle.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      toast({ title: tj('exportFailed'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-background border rounded-xl shadow-xl p-6 w-80 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">{tj('export')} {tj('chronicle')}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex gap-3">
          <Button
            variant={format === 'md' ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => setFormat('md')}
          >{tj('exportFormats.markdown')}</Button>
          <Button
            variant={format === 'pdf' ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => setFormat('pdf')}
          >{tj('exportFormats.pdf')}</Button>
        </div>
        <Button className="w-full" onClick={handleExport} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
          {tj('exportFormats.download')} {format.toUpperCase()}
        </Button>
      </div>
    </div>
  );
}

// ── Log entry creator ─────────────────────────────────────────────────────────

function LogEntryForm({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const { t: tj } = useTranslation('journal');
  const { t: tCommon } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const [entryType, setEntryType] = useState<'decision' | 'milestone' | 'risk' | 'note'>('note');
  const [title, setTitle] = useState('');
  const [bodyMd, setBodyMd] = useState('');
  const qc = useQueryClient();

  const createMut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/projects/${projectId}/log-entries`, {
        method: 'POST',
        body: JSON.stringify({ entryType, title, bodyMd }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['journal', projectId] });
      setOpen(false);
      setTitle('');
      setBodyMd('');
      onCreated();
    },
  });

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5 mr-1" />{tj('addEntry')}
      </Button>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex gap-2 flex-wrap">
        {(['decision', 'milestone', 'risk', 'note'] as const).map((type) => (
          <Button
            key={type}
            size="sm"
            variant={entryType === type ? 'default' : 'outline'}
            className="h-7 text-xs capitalize"
            onClick={() => setEntryType(type)}
          >{tj(`logEntry.types.${type}` as Parameters<typeof tj>[0])}</Button>
        ))}
      </div>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={tj('titleField')}
        className="text-sm"
      />
      <textarea
        value={bodyMd}
        onChange={(e) => setBodyMd(e.target.value)}
        placeholder={tj('detailsField')}
        className="w-full min-h-20 px-3 py-2 text-sm border rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>{tCommon('actions.cancel')}</Button>
        <Button size="sm" onClick={() => createMut.mutate()} disabled={!title.trim() || createMut.isPending}>
          {createMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}{tCommon('actions.save')}
        </Button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface Props { params: { id: string }; }

export default function JournalPage({ params }: Props) {
  const { id: projectId } = params;
  const { t, i18n } = useTranslation('events');
  const { t: tj } = useTranslation('journal');
  const locale = i18n.language === 'cs' ? 'cs-CZ' : 'uk-UA';

  const [showChronicle, setShowChronicle] = useState(false);
  const [includeSubprojects, setIncludeSubprojects] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allEvents, setAllEvents] = useState<JournalEvent[]>([]);

  const { data: project } = useQuery<Project>({
    queryKey: ['project', projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}`),
  });

  const params2 = new URLSearchParams();
  if (cursor) params2.set('cursor', cursor);
  if (includeSubprojects) params2.set('includeSubprojects', 'true');

  const { data, isLoading, error } = useQuery<JournalPage>({
    queryKey: ['journal', projectId, cursor, includeSubprojects],
    queryFn: async () => {
      const page = await apiFetch<JournalPage>(`/api/projects/${projectId}/journal?${params2.toString()}`);
      if (!cursor) {
        setAllEvents(page.events);
      } else {
        setAllEvents((prev) => [...prev, ...page.events]);
      }
      return page;
    },
  });

  // Group events by month for display
  const byMonth = new Map<string, JournalEvent[]>();
  for (const ev of allEvents) {
    const key = formatMonth(ev.createdAt, locale);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(ev);
  }

  const loadMore = () => {
    if (data?.nextCursor) setCursor(data.nextCursor);
  };

  return (
    <div className="flex-1 p-6 md:p-10 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/projects/${projectId}`}>
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </Link>
        <div className="flex-1 min-w-0">
          {project && <p className="text-xs text-muted-foreground font-mono mb-0.5">{project.code}</p>}
          <h1 className="text-2xl font-bold tracking-tight">{tj('activityJournal')}</h1>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowChronicle(true)}>
            <Download className="h-3.5 w-3.5 mr-1.5" />{tj('chronicle')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeSubprojects}
            onChange={(e) => { setIncludeSubprojects(e.target.checked); setCursor(undefined); }}
            className="rounded"
          />
          {tj('filters.includeSubprojects')}
        </label>
      </div>

      {/* Log entry form */}
      <LogEntryForm projectId={projectId} onCreated={() => setCursor(undefined)} />

      {/* Events */}
      {isLoading && allEvents.length === 0 ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{tj('loadFailed')}</p>
      ) : allEvents.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center space-y-3">
          <BookOpen className="h-10 w-10 text-muted-foreground mx-auto opacity-40" />
          <p className="text-muted-foreground text-sm">{tj('noActivity')}</p>
        </div>
      ) : (
        <div className="space-y-8" data-testid="journal-list">
          {Array.from(byMonth.entries()).map(([month, evs]) => (
            <div key={month}>
              <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm py-2 mb-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{month}</h3>
              </div>
              <ol className="relative border-l border-border space-y-4 ml-4">
                {evs.map((ev) => (
                  <EventRow key={ev.id} event={ev} t={t as (key: string, opts?: Record<string, string>) => string} locale={locale} />
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}

      {data?.nextCursor && (
        <div className="text-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}{tj('loadMore')}
          </Button>
        </div>
      )}

      {showChronicle && <ChronicleDialog projectId={projectId} onClose={() => setShowChronicle(false)} />}
    </div>
  );
}

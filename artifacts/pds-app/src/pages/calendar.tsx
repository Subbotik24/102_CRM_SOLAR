/**
 * Calendar page — monthly grid showing tasks by due date.
 * Route: /calendar
 */
import { useState } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

interface Task {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  projectId: string;
  projectName?: string;
  projectCode?: string;
}

const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-red-400',
  high: 'bg-orange-400',
  medium: 'bg-blue-400',
  low: 'bg-slate-400',
};

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  // Monday-first: shift Sunday (0) to 6
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

export default function CalendarPage() {
  const { t, i18n } = useTranslation(['tasks', 'common']);

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  // Fetch all tasks (large limit to cover calendar needs)
  const { data, isLoading } = useQuery<{ tasks: Task[] }>({
    queryKey: ['all-tasks-calendar'],
    queryFn: () => apiFetch('/api/tasks?limit=500'),
    staleTime: 60_000,
  });

  const tasks = data?.tasks ?? [];
  // Only tasks that have a dueAt date
  const dueTasks = tasks.filter(t => t.dueAt);

  // Group tasks by ISO date string "YYYY-MM-DD"
  const byDate = new Map<string, Task[]>();
  for (const task of dueTasks) {
    if (!task.dueAt) continue;
    const d = new Date(task.dueAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(task);
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDow = getFirstDayOfWeek(viewYear, viewMonth);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const calLocale = i18n.language === 'cs' ? 'cs-CZ' : 'uk-UA';
  const monthName = new Date(viewYear, viewMonth, 1).toLocaleDateString(calLocale, { month: 'long', year: 'numeric' });

  // Monday-first weekday labels derived from the active locale
  const weekdays = Array.from({ length: 7 }, (_, i) => {
    // 2024-01-01 is a Monday — offset by i to get Mon→Sun
    const d = new Date(2024, 0, 1 + i);
    return d.toLocaleDateString(calLocale, { weekday: 'short' });
  });

  // Build grid cells: leading blanks + days + trailing blanks, padded to a
  // multiple of 7 so the last row is always a complete, evenly bordered row.
  const cells: Array<{ day: number | null; key: string }> = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: null, key: `blank-lead-${i}` });
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, key });
  }
  const trailing = (7 - (cells.length % 7)) % 7;
  for (let i = 0; i < trailing; i++) cells.push({ day: null, key: `blank-trail-${i}` });

  return (
    <div className="flex-1 p-6 md:p-10 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <CalendarDays className="h-7 w-7 text-primary" />
            {t('common:nav.calendar')}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{t('common:calendar.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold min-w-[160px] text-center capitalize">{monthName}</span>
          <Button variant="outline" size="sm" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setViewYear(now.getFullYear()); setViewMonth(now.getMonth()); }}
            className="ml-2 text-xs"
          >
            {t('common:calendar.today')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-60">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b">
            {weekdays.map((wd) => (
              <div key={wd} className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {wd}
              </div>
            ))}
          </div>
          {/* Day cells */}
          <div className="grid grid-cols-7">
            {cells.map((cell, idx) => {
              const isToday = cell.day !== null && isSameDay(new Date(viewYear, viewMonth, cell.day), now);
              const cellTasks = cell.day !== null ? (byDate.get(cell.key) ?? []) : [];
              const isLastRow = idx >= cells.length - 7;
              return (
                <div
                  key={cell.key}
                  className={cn(
                    'min-h-[100px] p-1.5 border-b border-r last:border-r-0 overflow-hidden',
                    !cell.day && 'bg-muted/20',
                    isLastRow && 'border-b-0',
                    (idx + 1) % 7 === 0 && 'border-r-0',
                  )}
                >
                  {cell.day !== null && (
                    <>
                      <div className={cn(
                        'text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-1',
                        isToday ? 'bg-primary text-primary-foreground' : 'text-foreground',
                      )}>
                        {cell.day}
                      </div>
                      <div className="space-y-0.5">
                        {cellTasks.slice(0, 3).map(task => (
                          <Link key={task.id} href={`/tasks/${task.id}`}>
                            <div className="flex items-center gap-1 rounded px-1 py-0.5 text-xs hover:bg-accent/50 cursor-pointer transition-colors truncate">
                              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', PRIORITY_DOT[task.priority] ?? 'bg-slate-400')} />
                              <span className="truncate text-foreground">{task.title}</span>
                            </div>
                          </Link>
                        ))}
                        {cellTasks.length > 3 && (
                          <div className="text-xs text-muted-foreground px-1">+{cellTasks.length - 3} {t('common:calendar.more')}</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {Object.entries(PRIORITY_DOT).map(([p, cls]) => (
          <span key={p} className="flex items-center gap-1.5">
            <span className={cn('w-2 h-2 rounded-full', cls)} />
            {t(`tasks:priority.${p}`, { defaultValue: p })}
          </span>
        ))}
      </div>
    </div>
  );
}

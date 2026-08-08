import { Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { appLocale } from '@/lib/locale';

interface DueDateChipProps {
  dueAt: string | null | undefined;
  className?: string;
}

function getDueDateStyle(dueAt: string, locale: string): { color: string; label: string } {
  const due = new Date(dueAt);
  const label = due.toLocaleDateString(locale);

  // Compare by calendar day (strip time component) so a task due "today" is
  // never shown as overdue just because it was saved at midnight.
  const today = new Date();
  const todayDay  = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dueDay    = new Date(due.getFullYear(),   due.getMonth(),   due.getDate());
  const diffDays  = Math.round((dueDay.getTime() - todayDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { color: 'bg-red-500/15 text-red-400 border-red-500/30', label };
  } else if (diffDays <= 3) {
    return { color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', label };
  } else {
    return { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', label };
  }
}

export function DueDateChip({ dueAt, className }: DueDateChipProps) {
  const { i18n } = useTranslation();
  if (!dueAt) return null;
  const { color, label } = getDueDateStyle(dueAt, appLocale(i18n.language));
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md border font-medium shrink-0',
        color,
        className,
      )}
    >
      <Calendar className="h-3 w-3" />
      {label}
    </span>
  );
}

export function priorityBorderClass(priority: string): string {
  switch (priority) {
    case 'critical': return 'border-l-red-500';
    case 'high':     return 'border-l-orange-400';
    case 'medium':   return 'border-l-blue-400';
    default:         return 'border-l-slate-500/40';
  }
}

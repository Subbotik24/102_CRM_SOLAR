/**
 * Reusable drag-and-drop Kanban board built on @dnd-kit/core.
 * Each column is a droppable; each card is draggable.
 * On cross-column drop the `onStatusChange` callback fires.
 */
import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface KanbanTask {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  dueAt: string | null;
  /** shown on global board */
  projectName?: string;
  projectCode?: string;
  projectId?: string;
  /** resolved client-side from the project's stage list */
  stageName?: string;
  stageColor?: string | null;
}

const STATUSES = ['todo', 'in_progress', 'blocked', 'review', 'done'] as const;

// Labels resolved via i18n inside KanbanColumn — this constant is no longer used.

const STATUS_HEADER: Record<string, string> = {
  todo:        'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  in_progress: 'bg-blue-100  text-blue-700  dark:bg-blue-900  dark:text-blue-300',
  blocked:     'bg-red-100   text-red-700   dark:bg-red-900   dark:text-red-300',
  review:      'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  done:        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
};

const PRIORITY_DOT: Record<string, string> = {
  low:      'bg-slate-300',
  medium:   'bg-blue-400',
  high:     'bg-amber-400',
  critical: 'bg-rose-500',
};

function isOverdue(dueAt: string | null) {
  if (!dueAt) return false;
  return new Date(dueAt) < new Date();
}

// ── Draggable card ───────────────────────────────────────────────────────────

function KanbanCard({
  task, onCardClick, isDragging = false,
}: {
  task: KanbanTask;
  onCardClick?: (id: string) => void;
  isDragging?: boolean;
}) {
  const { i18n } = useTranslation();
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: task.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` }
    : undefined;
  const overdue = isOverdue(task.dueAt) && task.status !== 'done';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onCardClick?.(task.id)}
      className={cn(
        'rounded-md border bg-background p-3 text-xs space-y-2 cursor-grab active:cursor-grabbing',
        'hover:border-primary/40 hover:shadow-sm transition-all select-none',
        isDragging && 'opacity-50',
      )}
    >
      <p className="font-medium text-foreground line-clamp-2 leading-snug">{task.title}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-mono text-muted-foreground">{task.code}</span>
        <div
          className={cn('h-2 w-2 rounded-full shrink-0', PRIORITY_DOT[task.priority] ?? 'bg-slate-300')}
          title={task.priority}
        />
        {task.projectName && (
          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground truncate max-w-[100px]">
            {task.projectName}
          </span>
        )}
        {task.stageName && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground truncate max-w-[100px]">
            {task.stageColor && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: task.stageColor }} />}
            {task.stageName}
          </span>
        )}
        {overdue && task.dueAt && (
          <span className="flex items-center gap-0.5 text-rose-500 font-medium">
            <AlertCircle className="h-3 w-3" />
            {new Date(task.dueAt).toLocaleDateString(i18n.language === 'cs' ? 'cs-CZ' : 'uk-UA', { day: 'numeric', month: 'short' })}
          </span>
        )}
        {!overdue && task.dueAt && (
          <span className="text-muted-foreground">
            {new Date(task.dueAt).toLocaleDateString(i18n.language === 'cs' ? 'cs-CZ' : 'uk-UA', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>
    </div>
  );
}

// Overlay card (clone shown while dragging)
function OverlayCard({ task }: { task: KanbanTask }) {
  const overdue = isOverdue(task.dueAt) && task.status !== 'done';
  return (
    <div className="rounded-md border bg-background p-3 text-xs space-y-2 shadow-xl rotate-2 opacity-95 w-44">
      <p className="font-medium text-foreground line-clamp-2 leading-snug">{task.title}</p>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-muted-foreground">{task.code}</span>
        <div className={cn('h-2 w-2 rounded-full', PRIORITY_DOT[task.priority] ?? 'bg-slate-300')} />
        {overdue && <AlertCircle className="h-3 w-3 text-rose-500" />}
      </div>
    </div>
  );
}

// ── Droppable column ─────────────────────────────────────────────────────────

function KanbanColumn({
  status, tasks, onCardClick, activeId,
}: {
  status: string;
  tasks: KanbanTask[];
  onCardClick?: (id: string) => void;
  activeId: string | null;
}) {
  const { t } = useTranslation(['tasks', 'common']);
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex flex-col min-w-[180px] w-full">
      {/* Header */}
      <div className={cn(
        'flex items-center justify-between px-2.5 py-1.5 rounded-t-lg text-xs font-semibold',
        STATUS_HEADER[status],
      )}>
        <span>{t(`tasks:status.${status}`, { defaultValue: status })}</span>
        <span className="opacity-60 font-normal">{tasks.length}</span>
      </div>
      {/* Card area */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 min-h-[120px] rounded-b-lg border border-t-0 p-2 space-y-2 transition-colors',
          isOver ? 'bg-primary/5 border-primary/30' : 'bg-card/60',
        )}
      >
        {tasks.map(task => (
          <KanbanCard
            key={task.id}
            task={task}
            onCardClick={onCardClick}
            isDragging={task.id === activeId}
          />
        ))}
        {tasks.length === 0 && (
          <div className="h-16 flex items-center justify-center text-xs text-muted-foreground/40 italic">
            {t('common:kanban.dropHere')}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main board ───────────────────────────────────────────────────────────────

export interface KanbanBoardProps {
  tasks: KanbanTask[];
  onStatusChange: (taskId: string, newStatus: string) => void;
  onCardClick?: (taskId: string) => void;
}

export function KanbanBoard({ tasks, onStatusChange, onCardClick }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const taskId   = active.id as string;
    const newStatus = over.id as string;
    const task     = tasks.find(t => t.id === taskId);
    if (task && newStatus !== task.status && STATUSES.includes(newStatus as typeof STATUSES[number])) {
      onStatusChange(taskId, newStatus);
    }
  }

  const byStatus = STATUSES.reduce<Record<string, KanbanTask[]>>((acc, s) => {
    acc[s] = tasks.filter(t => t.status === s && !('parentTaskId' in t && (t as { parentTaskId?: unknown }).parentTaskId));
    return acc;
  }, {} as Record<string, KanbanTask[]>);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className="grid gap-2 pb-2"
        style={{ gridTemplateColumns: `repeat(${STATUSES.length}, minmax(160px,1fr))` }}
      >
        {STATUSES.map(status => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={byStatus[status] ?? []}
            onCardClick={onCardClick}
            activeId={activeId}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? <OverlayCard task={activeTask} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

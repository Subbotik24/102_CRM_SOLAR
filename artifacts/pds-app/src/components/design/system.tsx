import type { ElementType, ReactNode } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import i18n from "@/i18n/i18n";

export function PageHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
}: {
  icon?: ElementType;
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="border-b bg-background/95 px-5 py-5 backdrop-blur md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-[1440px] items-start gap-3">
        {Icon ? (
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-primary/10 text-primary shadow-xs">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="mb-1 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-primary">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-[1.75rem]">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  tone = "primary",
  detail,
}: {
  icon: ElementType;
  label: string;
  value: number | string;
  tone?: "primary" | "success" | "warning" | "danger";
  detail?: string;
}) {
  return (
    <div className="metric-card">
      <div className={cn("metric-icon", `metric-icon-${tone}`)}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="metric-value">{value}</p>
        <p className="metric-label">{label}</p>
        {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
      </div>
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ElementType;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
      <p className="font-medium text-foreground">{title}</p>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action}
    </div>
  );
}

export function LoadingState({ label }: { label?: string }) {
  return (
    <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>{label ?? i18n.t("common:status.loading")}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex min-h-36 items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
      <AlertCircle className="h-4 w-4" aria-hidden="true" />
      <span>{message}</span>
      {onRetry ? <button type="button" className="min-h-9 rounded border border-destructive/40 px-2 py-1 text-xs" onClick={onRetry}>{i18n.t("common:actions.retry")}</button> : null}
    </div>
  );
}

export function StatusBadge({
  status,
  children,
}: {
  status: string;
  children: ReactNode;
}) {
  const tone =
    status === "done" || status === "active"
      ? "success"
      : status === "blocked" || status === "critical"
        ? "danger"
        : status === "review" || status === "on_hold" || status === "high"
          ? "warning"
          : status === "in_progress"
            ? "primary"
            : "neutral";
  return <span className={cn("status-badge", `status-badge-${tone}`)}>{children}</span>;
}

export function FilterToolbar({ children }: { children: ReactNode }) {
  return <div className="filter-toolbar">{children}</div>;
}

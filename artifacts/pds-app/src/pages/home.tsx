import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CalendarClock,
  CheckSquare,
  CircleDot,
  Clock3,
  Layers,
  ShieldCheck,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  PageHeader,
  SectionHeader,
  StatusBadge,
} from "@/components/design/system";
import { cn } from "@/lib/utils";

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) throw new Error(res.statusText);
  return res.json() as Promise<T>;
}

interface Project {
  id: string;
  code: string;
  name: string;
  icon: string;
  status: string;
  clientName: string | null;
  dueOn: string | null;
}

interface Task {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  projectId: string;
  projectName: string;
  projectCode: string;
}

const TASK_STATUSES = ["todo", "in_progress", "review", "blocked", "done"] as const;
const PROJECT_STATUSES = ["planned", "active", "on_hold", "done"] as const;
const EMPTY_TASKS: Task[] = [];
const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-4))",
  "hsl(var(--destructive))",
  "hsl(var(--chart-3))",
];

function isBeforeNow(value: string | null, now: Date): boolean {
  return Boolean(value && new Date(value).getTime() < now.getTime());
}

export default function HomePage() {
  const { t, i18n } = useTranslation("common");
  const { t: tp } = useTranslation("projects");
  const { t: tt } = useTranslation("tasks");
  const { data: me } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), staleTime: 60_000 },
  });

  const canViewDelivery = Boolean(me && me.role !== "guest");
  const hasTeamScope = me?.role === "admin" || me?.role === "manager";

  const projectsQuery = useQuery<{ projects: Project[] }>({
    queryKey: ["projects"],
    queryFn: () => apiFetch("/api/projects"),
    enabled: canViewDelivery,
    staleTime: 30_000,
  });

  const tasksQuery = useQuery<{ tasks: Task[] }>({
    queryKey: ["dashboard-tasks", hasTeamScope ? "team" : me?.id],
    queryFn: () =>
      apiFetch(
        hasTeamScope
          ? "/api/tasks?limit=500"
          : `/api/tasks?assigneeId=${me!.id}&limit=100`
      ),
    enabled: canViewDelivery,
    staleTime: 30_000,
  });

  const projects = projectsQuery.data?.projects ?? [];
  const tasks = tasksQuery.data?.tasks ?? EMPTY_TASKS;
  const now = useMemo(() => new Date(), []);
  const locale = i18n.language === "cs" ? "cs-CZ" : "uk-UA";
  const dateText = now.toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const greeting =
    now.getHours() < 12
      ? t("home.goodMorning")
      : now.getHours() < 17
        ? t("home.goodDay")
        : t("home.goodEvening");

  const delivery = useMemo(() => {
    const open = tasks.filter((task) => task.status !== "done");
    const overdue = open.filter((task) => isBeforeNow(task.dueAt, now));
    const blocked = open.filter((task) => task.status === "blocked");
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + 14);
    const upcoming = open
      .filter((task) => {
        if (!task.dueAt) return false;
        const due = new Date(task.dueAt);
        return due >= now && due <= horizon;
      })
      .sort(
        (a, b) =>
          new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime()
      );
    const attention = Array.from(
      new Map([...overdue, ...blocked].map((task) => [task.id, task])).values()
    ).sort((a, b) => {
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    });
    return { open, overdue, blocked, upcoming, attention };
  }, [tasks, now]);

  const taskStatusData = TASK_STATUSES.map((status) => ({
    status,
    label: tt(`status.${status}`),
    value: tasks.filter((task) => task.status === status).length,
  })).filter((item) => item.value > 0);

  const projectStatusData = PROJECT_STATUSES.map((status) => ({
    status,
    label: tp(`status.${status}`),
    value: projects.filter((project) => project.status === status).length,
  })).filter((item) => item.value > 0);

  const activeProjects = projects.filter((project) => project.status === "active");
  const isLoading = projectsQuery.isLoading || tasksQuery.isLoading;
  const hasError = projectsQuery.isError || tasksQuery.isError;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        eyebrow={hasTeamScope ? t("home.teamScope") : t("home.personalScope")}
        title={`${greeting}${me?.displayName ? `, ${me.displayName.split(" ")[0]}` : ""}`}
        description={dateText}
      />

      <main className="page-frame" data-testid="delivery-dashboard">
        {!canViewDelivery ? (
          <EmptyState
            icon={ShieldCheck}
            title={t("home.restrictedTitle")}
            description={t("home.restrictedDescription")}
          />
        ) : isLoading ? (
          <LoadingState label={t("status.loading")} />
        ) : hasError ? (
          <ErrorState message={t("home.loadFailed")} onRetry={() => { void projectsQuery.refetch(); void tasksQuery.refetch(); }} />
        ) : (
          <>
            <section
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
              aria-label={t("home.deliveryHealth")}
            >
              <MetricCard
                icon={Layers}
                label={t("home.activeProjects")}
                value={activeProjects.length}
                tone="primary"
              />
              <MetricCard
                icon={CheckSquare}
                label={t("home.openTasks")}
                value={delivery.open.length}
                tone="success"
              />
              <MetricCard
                icon={AlertTriangle}
                label={t("home.overdue")}
                value={delivery.overdue.length}
                tone={delivery.overdue.length ? "danger" : "success"}
              />
              <MetricCard
                icon={Ban}
                label={t("home.blocked")}
                value={delivery.blocked.length}
                tone={delivery.blocked.length ? "warning" : "success"}
              />
            </section>

            <section className="grid grid-cols-1 gap-5 xl:grid-cols-5">
              <div className="section-panel xl:col-span-3">
                <SectionHeader
                  title={t("home.taskDistribution")}
                  description={t("home.taskDistributionDescription")}
                  action={
                    <Link href="/tasks" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      {t("actions.view")} <ArrowRight className="h-3 w-3" />
                    </Link>
                  }
                />
                {taskStatusData.length ? (
                  <>
                    <div
                      className="h-60 w-full"
                      role="img"
                      aria-label={taskStatusData
                        .map((item) => `${item.label}: ${item.value}`)
                        .join(", ")}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={taskStatusData}
                          layout="vertical"
                          margin={{ top: 8, right: 24, bottom: 0, left: 8 }}
                        >
                          <CartesianGrid
                            stroke="hsl(var(--border))"
                            horizontal={false}
                          />
                          <XAxis
                            type="number"
                            allowDecimals={false}
                            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            type="category"
                            dataKey="label"
                            width={105}
                            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            cursor={{ fill: "hsl(var(--muted) / 0.45)" }}
                            contentStyle={{
                              background: "hsl(var(--popover))",
                              color: "hsl(var(--popover-foreground))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: 8,
                            }}
                          />
                          <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 5, 5, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="sr-only">
                      {taskStatusData.map((item) => (
                        <li key={item.status}>{item.label}: {item.value}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <EmptyState icon={CircleDot} title={t("home.noTasks")} />
                )}
              </div>

              <div className="section-panel xl:col-span-2">
                <SectionHeader
                  title={t("home.projectPortfolio")}
                  description={t("home.projectPortfolioDescription")}
                />
                {projectStatusData.length ? (
                  <div className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-2">
                    <div
                      className="h-56 min-w-0"
                      role="img"
                      aria-label={projectStatusData
                        .map((item) => `${item.label}: ${item.value}`)
                        .join(", ")}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={projectStatusData}
                            dataKey="value"
                            nameKey="label"
                            innerRadius="58%"
                            outerRadius="82%"
                            paddingAngle={3}
                            stroke="hsl(var(--card))"
                            strokeWidth={2}
                          >
                            {projectStatusData.map((item, index) => (
                              <Cell
                                key={item.status}
                                fill={CHART_COLORS[index % CHART_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: "hsl(var(--popover))",
                              color: "hsl(var(--popover-foreground))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: 8,
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="space-y-2">
                      {projectStatusData.map((item, index) => (
                        <li key={item.status} className="flex items-center gap-2 text-xs">
                          <span
                            className="h-2.5 w-2.5 rounded-sm"
                            style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.label}</span>
                          <strong className="tabular-nums text-foreground">{item.value}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <EmptyState icon={Layers} title={tp("noProjects")} />
                )}
              </div>
            </section>

            <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <div className="section-panel">
                <SectionHeader
                  title={t("home.upcomingDeadlines")}
                  description={t("home.next14Days")}
                  action={<CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />}
                />
                {delivery.upcoming.length ? (
                  <div className="divide-y">
                    {delivery.upcoming.slice(0, 7).map((task) => (
                      <Link
                        key={task.id}
                        href={`/tasks/${task.id}`}
                        className="flex items-center gap-3 py-3 transition-colors hover:bg-accent/30"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Clock3 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                          <p className="truncate font-mono text-[11px] text-muted-foreground">
                            {task.projectCode} · {task.projectName}
                          </p>
                        </div>
                        <span className="text-xs font-medium tabular-nums text-muted-foreground">
                          {new Date(task.dueAt!).toLocaleDateString(locale, {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={CalendarClock} title={t("home.noUpcomingDeadlines")} />
                )}
              </div>

              <div className="section-panel">
                <SectionHeader
                  title={t("home.needsAttention")}
                  description={t("home.needsAttentionDescription")}
                  action={<AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />}
                />
                {delivery.attention.length ? (
                  <div className="divide-y">
                    {delivery.attention.slice(0, 7).map((task) => {
                      const overdue = isBeforeNow(task.dueAt, now);
                      return (
                        <Link
                          key={task.id}
                          href={`/tasks/${task.id}`}
                          className="flex items-center gap-3 py-3 transition-colors hover:bg-accent/30"
                        >
                          <div
                            className={cn(
                              "h-2.5 w-2.5 shrink-0 rounded-full",
                              overdue ? "bg-destructive" : "bg-amber-500"
                            )}
                            aria-hidden="true"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                            <p className="truncate font-mono text-[11px] text-muted-foreground">
                              {task.projectCode} · {task.projectName}
                            </p>
                          </div>
                          <StatusBadge status={overdue ? "critical" : task.status}>
                            {overdue ? t("home.overdue") : tt(`status.${task.status}`)}
                          </StatusBadge>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    icon={ShieldCheck}
                    title={t("home.allHealthy")}
                    description={t("home.allHealthyDescription")}
                  />
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

import React from "react";
import { Link, useLocation } from "wouter";
import { BrandLogo } from "@/components/brand-logo";
import { useTranslation } from "react-i18next";
import { useGetMe, useLogout, getGetMeQueryKey } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Home,
  CheckSquare,
  Layers,
  MessageSquare,
  Menu,
  LogOut,
  Globe,
  Building2,
  Users,
  Settings,
  Library,
  Kanban,
  CalendarDays,
  Archive,
  Moon,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { AvatarBadge, AvatarPicker } from "@/components/ui/avatar-badge";
import { NotificationBell } from "@/components/notification-bell";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');


export function AppShell({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { t, i18n } = useTranslation("common");
  const queryClient = useQueryClient();
  const logoutMutation = useLogout();
  const [avatarPickerOpen, setAvatarPickerOpen] = React.useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  const updateAvatarMutation = useMutation({
    mutationFn: (avatarKey: string) =>
      fetch(`${BASE}/api/profile`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarKey }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setAvatarPickerOpen(false);
    },
  });

  const { data: user } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), staleTime: 30000 }
  });

  const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager';

  const NAV_ITEMS = [
    { path: "/",          labelKey: "nav.home",     icon: Home,          mobileOnly: false },
    { path: "/tasks",     labelKey: "nav.tasks",    icon: CheckSquare,   mobileOnly: false },
    { path: "/projects",  labelKey: "nav.projects", icon: Layers,        mobileOnly: false },
    { path: "/kanban",    labelKey: "nav.kanban",   icon: Kanban,        mobileOnly: false, desktopOnly: true },
    { path: "/clients",   labelKey: "nav.clients",  icon: Building2,     mobileOnly: false, desktopOnly: true },
    ...(user?.role === 'admin' ? [{ path: "/members", labelKey: "nav.members", icon: Users, mobileOnly: false, desktopOnly: true }] : []),
    { path: "/library",   labelKey: "nav.library",  icon: Library,       mobileOnly: false, desktopOnly: true },
    { path: "/calendar",  labelKey: "nav.calendar", icon: CalendarDays,  mobileOnly: false, desktopOnly: true },
    { path: "/chat",      labelKey: "nav.chat",     icon: MessageSquare, mobileOnly: false },
    ...(isAdminOrManager ? [{ path: "/settings", labelKey: "nav.settings", icon: Settings, mobileOnly: false, desktopOnly: true }] : []),
    ...(isAdminOrManager ? [{ path: "/archive", labelKey: "nav.archive", icon: Archive, mobileOnly: false, desktopOnly: true }] : []),
    { path: "/more",      labelKey: "nav.more",     icon: Menu,          mobileOnly: true  },
  ];

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        // Mark the current user as signed out immediately. Invalidating keeps
        // stale data long enough for GuestGuard to redirect /login back home,
        // while removing it makes the guard issue an expected-but-noisy 401.
        queryClient.setQueryData(getGetMeQueryKey(), null);
        setLocation("/login");
      }
    });
  };

  const toggleLocale = () => {
    const nextLocale = i18n.language === 'uk' ? 'cs' : 'uk';
    i18n.changeLanguage(nextLocale);
    localStorage.setItem('pds.locale', nextLocale);
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground selection:bg-primary/20">

      {/* Desktop Sidebar */}
      <aside className="relative z-20 hidden w-[248px] shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground shadow-xl shadow-black/5 md:flex">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-sidebar-primary/10 to-transparent" />
        {/* Header — logo + notifications */}
        <div className="relative flex h-16 shrink-0 items-center border-b border-sidebar-border px-5">
          <BrandLogo className="flex-1 text-sidebar-primary" />
          <NotificationBell />
        </div>

        {/* Nav items */}
        <nav className="relative flex-1 space-y-1 overflow-y-auto px-3 py-5">
          {NAV_ITEMS.filter(item => !item.mobileOnly).map((item) => {
            const isActive = location === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-sidebar-primary/20"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
                data-testid={`nav-desktop-${item.labelKey.split('.')[1]}`}
              >
                <item.icon className={cn("h-4 w-4 transition-transform", isActive && "stroke-[2.5px]")} />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section — user + locale/logout */}
        <div className="relative shrink-0 space-y-3 border-t border-sidebar-border p-3">
          {/* User info + avatar picker */}
          <div className="relative">
            <div className="flex items-center gap-3 px-2">
              <AvatarBadge
                name={user?.displayName || t("user")}
                avatarKey={(user as { avatarKey?: string } | undefined)?.avatarKey}
                size="sm"
                onClick={() => setAvatarPickerOpen(p => !p)}
                className="ring-2 ring-sidebar-primary/30"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate text-sidebar-foreground">{user?.displayName || t("user")}</div>
                <div className="text-xs text-sidebar-foreground/50 truncate font-mono">{user?.role ? t(`roles.${user.role}`, { defaultValue: user.role }) : t("roles.member")}</div>
              </div>
            </div>
            {avatarPickerOpen && (
              <div className="absolute bottom-full left-0 mb-2 p-3 rounded-xl border bg-popover shadow-lg z-50 w-full">
                <p className="text-xs text-muted-foreground mb-2">{t('members.changeAvatar', { defaultValue: 'Колір аватара' })}</p>
                <AvatarPicker
                  current={(user as { avatarKey?: string } | undefined)?.avatarKey ?? '1'}
                  onChange={(key) => updateAvatarMutation.mutate(key)}
                />
              </div>
            )}
          </div>

          {/* Language toggle + logout */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLocale}
              className="flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-sidebar-accent text-xs font-medium text-sidebar-accent-foreground transition-colors hover:bg-sidebar-accent/80"
              data-testid="btn-toggle-locale"
            >
              <Globe className="h-3.5 w-3.5" />
              {i18n.language.toUpperCase()}
            </button>
            <button
              onClick={toggleTheme}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-sidebar-accent-foreground transition-colors hover:bg-sidebar-accent/80"
              data-testid="btn-toggle-theme"
              aria-label={resolvedTheme === "dark" ? "Light theme" : "Dark theme"}
            >
              {resolvedTheme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 h-9 rounded-md bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80 transition-colors text-xs font-medium"
              data-testid="btn-logout-sidebar"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t("exit")}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-y-auto">
        {/* Mobile Header */}
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur md:hidden">
          <BrandLogo className="flex-1 text-primary" />
          <button
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-md border bg-card text-foreground"
            data-testid="btn-toggle-theme-mobile"
            aria-label={resolvedTheme === "dark" ? "Light theme" : "Dark theme"}
          >
            {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <NotificationBell />
        </header>

        <div className="flex-1 pb-16 md:pb-0">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-around border-t bg-background/95 px-2 pb-safe shadow-[0_-8px_24px_hsl(var(--foreground)/0.05)] backdrop-blur md:hidden" style={{ height: '64px' }}>
        {NAV_ITEMS.filter(item => !item.desktopOnly).map((item) => {
          const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path));
          return (
            <Link
              key={item.path}
              href={item.path}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-1 text-[10px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
              data-testid={`nav-mobile-${item.labelKey.split('.')[1]}`}
            >
              <item.icon className={cn("h-5 w-5", isActive && "stroke-[2.5px]")} />
              <span className="truncate w-full text-center px-1">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

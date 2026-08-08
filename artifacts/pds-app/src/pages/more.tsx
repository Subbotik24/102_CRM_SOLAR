import { useTranslation } from "react-i18next";
import { useLogout, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { LogOut, User, Settings, Globe, Building2, Users, Archive } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function MorePage() {
  const { t } = useTranslation("common");
  const logoutMutation = useLogout();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey(), staleTime: 60_000 } });
  const isAdminOrManager = me?.role === 'admin' || me?.role === 'manager';

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.setQueryData(getGetMeQueryKey(), null);
        setLocation("/login");
      }
    });
  };

  return (
    <div className="flex-1 p-6 md:p-10 space-y-6 max-w-3xl">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground" data-testid="text-page-title">
          {t("more.title")}
        </h1>
        <p className="text-muted-foreground">
          {t("more.subtitle")}
        </p>
      </div>

      <div className="grid gap-4">
        <div className="rounded-xl border bg-card shadow-sm divide-y">
          <Link href="/clients">
            <div className="p-4 flex items-center gap-4 hover:bg-muted/50 transition-colors cursor-pointer">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-foreground">{t("nav.clients")}</h3>
                <p className="text-sm text-muted-foreground">{t("clients.pageSubtitle")}</p>
              </div>
            </div>
          </Link>

          <Link href="/members">
            <div className="p-4 flex items-center gap-4 hover:bg-muted/50 transition-colors cursor-pointer">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Users className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-foreground">{t("nav.members")}</h3>
                <p className="text-sm text-muted-foreground">{t("members.pageSubtitle")}</p>
              </div>
            </div>
          </Link>

          <div className="p-4 flex items-center gap-4 hover:bg-muted/50 transition-colors cursor-pointer" data-testid="btn-profile-settings">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <User className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-foreground">{t("more.profileSettings")}</h3>
              <p className="text-sm text-muted-foreground">{t("more.profileSubtitle")}</p>
            </div>
          </div>

          {isAdminOrManager && (
            <Link href="/settings">
              <div className="p-4 flex items-center gap-4 hover:bg-muted/50 transition-colors cursor-pointer" data-testid="btn-settings">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Settings className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-foreground">{t("nav.settings")}</h3>
                  <p className="text-sm text-muted-foreground">{t("more.settingsSubtitle")}</p>
                </div>
              </div>
            </Link>
          )}

          {isAdminOrManager && (
            <Link href="/archive">
              <div className="p-4 flex items-center gap-4 hover:bg-muted/50 transition-colors cursor-pointer" data-testid="btn-archive">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Archive className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-foreground">{t("nav.archive")}</h3>
                  <p className="text-sm text-muted-foreground">{t("more.archiveSubtitle")}</p>
                </div>
              </div>
            </Link>
          )}

          <div className="p-4 flex items-center gap-4 hover:bg-muted/50 transition-colors cursor-pointer" data-testid="btn-language-settings">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Globe className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-foreground">{t("more.language")}</h3>
              <p className="text-sm text-muted-foreground">{t("more.languageSubtitle")}</p>
            </div>
          </div>
        </div>

        <Button
          variant="destructive"
          className="w-full sm:w-auto sm:self-start gap-2"
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
          data-testid="btn-logout"
        >
          <LogOut className="h-4 w-4" />
          {logoutMutation.isPending ? t("more.loggingOut") : t("more.logOut")}
        </Button>
      </div>
    </div>
  );
}

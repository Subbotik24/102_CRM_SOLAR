import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n/i18n';

import { GuestGuard } from '@/components/auth/guest-guard';
import { ThemeProvider } from '@/components/theme/theme-provider';
import LoginPage from '@/pages/login';
import { AppErrorBoundary } from '@/components/app-error-boundary';
import { ConfirmProvider } from '@/components/confirm-provider';

const AuthenticatedRoutes = lazy(() => import('@/authenticated-routes'));
const InviteAcceptPage = lazy(() => import('@/pages/invite-accept'));
const ResetPasswordPage = lazy(() => import('@/pages/reset-password'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const status = (error as Error & { status?: number }).status;
        return status !== undefined && status < 500 ? false : failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/login"><GuestGuard><LoginPage /></GuestGuard></Route>
      <Route path="/invite/accept" component={InviteAcceptPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route component={AuthenticatedRoutes} />
    </Switch>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <ConfirmProvider>
              <AppErrorBoundary>
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
                  <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">{i18n.t('common:status.loading')}</div>}>
                    <Router />
                  </Suspense>
                </WouterRouter>
              </AppErrorBoundary>
              <Toaster />
            </ConfirmProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </I18nextProvider>
    </ThemeProvider>
  );
}

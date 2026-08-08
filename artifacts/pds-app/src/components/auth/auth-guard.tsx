import React, { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useGetMe, getGetMeQueryKey, ApiError } from '@workspace/api-client-react';
import { FullPageLoader } from '@/components/ui/loader';

/** Only a real 401/403 means "not authenticated" — a network blip, a 5xx,
 * or a transient dev-server restart must not force a legitimate session out. */
function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();

  const { data: user, isLoading, isFetching, error } = useGetMe({
    query: {
      retry: 2,
      staleTime: 30000,
      queryKey: getGetMeQueryKey()
    }
  });

  const unauthenticated = isUnauthenticated(error);

  useEffect(() => {
    if (unauthenticated) {
      setLocation('/login');
    }
  }, [unauthenticated, setLocation]);

  if (unauthenticated) {
    return null; // Will redirect in useEffect
  }

  // Show a loader until we have a confirmed user — either the initial fetch,
  // or a retry after a transient failure — rather than rendering the shell
  // with a placeholder identity for a user who isn't actually known yet.
  if (!user && (isLoading || isFetching)) {
    return <FullPageLoader />;
  }

  // A non-auth error with previously cached user data (network blip, 5xx
  // during a background refetch) still renders children — a legitimate
  // session should not be kicked out for a failure unrelated to auth.
  return <>{children}</>;
}

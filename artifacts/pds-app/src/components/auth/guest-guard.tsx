import React, { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useGetMe, getGetMeQueryKey } from '@workspace/api-client-react';
import { FullPageLoader } from '@/components/ui/loader';

export function GuestGuard({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();

  const { data: user, isLoading } = useGetMe({
    query: {
      retry: false,
      staleTime: 30000,
      queryKey: getGetMeQueryKey()
    }
  });

  useEffect(() => {
    if (user) {
      setLocation('/');
    }
  }, [user, setLocation]);

  if (isLoading) {
    return <FullPageLoader />;
  }

  if (user) {
    return null; // Will redirect
  }

  return <>{children}</>;
}

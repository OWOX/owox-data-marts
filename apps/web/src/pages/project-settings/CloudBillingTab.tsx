import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { Skeleton } from '@owox/ui/components/skeleton';
import { useFlags } from '../../app/store/hooks';
import { getCloudBillingOrigin } from '../../features/cloud-billing/cloud-billing';
import { RequestStatus } from '../../shared/types/request-status';

export function CloudBillingTab({
  children,
  fallback,
}: {
  children: (origin: string) => ReactNode;
  fallback: ReactNode;
}) {
  const { flags, callState } = useFlags();
  if (callState === RequestStatus.IDLE || callState === RequestStatus.LOADING) {
    return <Skeleton className='h-20 w-full' aria-label='Loading' />;
  }
  const origin = getCloudBillingOrigin(flags);
  if (origin) return children(origin);

  return flags?.IDP_PROVIDER === 'owox-better-auth' ? fallback : <Navigate to='..' replace />;
}

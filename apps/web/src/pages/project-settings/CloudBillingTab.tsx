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
  if (flags?.IDP_PROVIDER !== 'owox-better-auth') {
    return <Navigate to='..' replace />;
  }
  const origin = getCloudBillingOrigin(flags);
  return origin ? children(origin) : fallback;
}

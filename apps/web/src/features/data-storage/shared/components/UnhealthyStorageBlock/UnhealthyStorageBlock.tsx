import type { ReactNode } from 'react';
import { DataStorageHealthStatus } from '../../services/data-storage-health-status.service';
import { DataStorageHealthStatusView } from '../DataStorageHealthIndicator/DataStorageHealthStatusView';

interface UnhealthyStorageBlockProps {
  status: DataStorageHealthStatus;
  errorMessage?: string;
  footer?: ReactNode;
}

export function UnhealthyStorageBlock({
  status,
  errorMessage,
  footer,
}: UnhealthyStorageBlockProps) {
  return (
    <>
      <section className='dm-card-block !gap-2 text-sm'>
        <DataStorageHealthStatusView status={status} errorMessage={errorMessage} />
      </section>
      {footer}
    </>
  );
}

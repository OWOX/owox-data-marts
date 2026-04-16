import { CircleCheck, CircleDashed, TriangleAlert } from 'lucide-react';
import {
  DataStorageHealthStatus,
  HEALTH_STATUS_UNCONFIGURED_TEXT,
} from '../../services/data-storage-health-status.service';

interface Props {
  status: DataStorageHealthStatus;
  errorMessage?: string;
}

export function DataStorageHealthStatusView({ status, errorMessage }: Props) {
  if (status === DataStorageHealthStatus.VALID) {
    return (
      <div className='flex items-center gap-2 text-sm text-green-500'>
        <CircleCheck className='size-4' />
        <span>Storage access validated</span>
      </div>
    );
  }

  if (status === DataStorageHealthStatus.UNCONFIGURED) {
    return (
      <div className='text-muted-foreground flex items-center gap-2 text-sm'>
        <CircleDashed className='size-4' />
        <span>{HEALTH_STATUS_UNCONFIGURED_TEXT}</span>
      </div>
    );
  }

  return (
    <div className='flex items-center gap-2 text-sm text-red-500'>
      <TriangleAlert className='size-4' />
      <span>{errorMessage ?? 'Access validation failed'}</span>
    </div>
  );
}

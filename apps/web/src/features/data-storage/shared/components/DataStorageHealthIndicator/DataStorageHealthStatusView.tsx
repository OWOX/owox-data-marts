import { CircleCheck, CircleDashed, TriangleAlert } from 'lucide-react';
import {
  DataStorageHealthStatus,
  UNCONFIGURED_STATUS_LABEL,
} from '../../services/data-storage-health-status.service';

interface Props {
  status: DataStorageHealthStatus;
  errorMessage?: string;
  isLoading?: boolean;
}

export function DataStorageHealthStatusView({ status, errorMessage, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className='text-muted-foreground flex animate-pulse items-center gap-2 text-sm'>
        <CircleDashed className='size-4' />
        <span>Validating storage access...</span>
      </div>
    );
  }

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
        <span>{UNCONFIGURED_STATUS_LABEL}</span>
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

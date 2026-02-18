import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  HoverCardHeader,
  HoverCardHeaderText,
  HoverCardHeaderTitle,
  HoverCardHeaderDescription,
  HoverCardBody,
  HoverCardItem,
  HoverCardItemValue,
} from '@owox/ui/components/hover-card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import { useDataStorageHealthStatus } from '../../model/hooks/useDataStorageHealthStatus';
import { DataStorageHealthStatus } from '../../services/data-storage-health-status.service';
import { CircleCheck, TriangleAlert } from 'lucide-react';

interface DataStorageHealthIndicatorProps {
  storageId: string;
  storageTitle?: string;
  hovercardSide?: 'top' | 'right' | 'bottom' | 'left';
}

const HEALTH_STATUS_CONFIG: Record<
  DataStorageHealthStatus,
  { text: string; dotClass: string; ringClass: string }
> = {
  [DataStorageHealthStatus.VALID]: {
    text: 'Storage access is valid',
    dotClass: 'bg-green-500',
    ringClass: 'ring-green-500/50',
  },
  [DataStorageHealthStatus.INVALID]: {
    text: 'Storage access validation failed',
    dotClass: 'bg-red-500',
    ringClass: 'ring-red-500/50',
  },
};

function getTooltipText(params: { status: DataStorageHealthStatus; isLoading: boolean }): string {
  const { status, isLoading } = params;

  if (isLoading) return 'Validating storage access...';

  return HEALTH_STATUS_CONFIG[status].text;
}

export function DataStorageHealthIndicator({
  storageId,
  storageTitle,
  hovercardSide = 'bottom',
}: DataStorageHealthIndicatorProps) {
  const { status, errorMessage, isLoading, isFetched } = useDataStorageHealthStatus(storageId);

  const { dotClass, ringClass } = isFetched
    ? HEALTH_STATUS_CONFIG[status]
    : { dotClass: 'bg-neutral-300 dark:bg-neutral-600', ringClass: 'ring-neutral-400/50' };

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div className='group inline-flex h-6 w-6 cursor-pointer items-center justify-center'>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className='relative'>
                <div
                  className={cn(
                    'h-2 w-2 rounded-full transition-colors',
                    dotClass,
                    isLoading && 'animate-pulse'
                  )}
                />

                <div
                  className={cn(
                    'pointer-events-none absolute -inset-[3px] rounded-full opacity-0 ring-1 transition-opacity',
                    'group-hover:opacity-100 group-focus-visible:opacity-100',
                    ringClass
                  )}
                />
              </div>
            </TooltipTrigger>

            <TooltipContent side='top' align='center'>
              {getTooltipText({ status, isLoading })}
            </TooltipContent>
          </Tooltip>
        </div>
      </HoverCardTrigger>

      {isFetched && !isLoading && (
        <HoverCardContent side={hovercardSide} align='start'>
          <HoverCardHeader>
            <HoverCardHeaderText>
              <HoverCardHeaderTitle>{storageTitle ?? 'Storage Validation'}</HoverCardHeaderTitle>
              <HoverCardHeaderDescription>Storage validation result</HoverCardHeaderDescription>
            </HoverCardHeaderText>
          </HoverCardHeader>

          <HoverCardBody>
            <HoverCardItem>
              <HoverCardItemValue>
                {status === DataStorageHealthStatus.VALID ? (
                  <div className='flex items-center gap-2 text-green-500'>
                    <CircleCheck className='size-4' />
                    <span>Storage access validated</span>
                  </div>
                ) : (
                  <div className='flex items-center gap-2 text-red-500'>
                    <TriangleAlert className='size-4' />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </HoverCardItemValue>
            </HoverCardItem>
          </HoverCardBody>
        </HoverCardContent>
      )}
    </HoverCard>
  );
}

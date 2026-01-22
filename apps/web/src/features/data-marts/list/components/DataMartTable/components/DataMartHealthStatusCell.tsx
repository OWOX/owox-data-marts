import type { DataMartListItem } from '../../../model/types';
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
  HoverCardItemLabel,
  HoverCardItemValue,
  HoverCardFooter,
} from '@owox/ui/components/hover-card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { StatusLabel, StatusTypeEnum } from '../../../../../../shared/components/StatusLabel';
import { Button } from '@owox/ui/components/button';
import { ChevronRight } from 'lucide-react';
import { useDataMartHealthStatus } from '../../../model/hooks';
import { DataMartDefinitionType } from '../../../../shared';
import { DataMartRunStatus } from '../../../../shared/enums/data-mart-run-status.enum';
import { useProjectRoute } from '../../../../../../shared/hooks';
import RelativeTime from '@owox/ui/components/common/relative-time';
import { DataMartStatus } from '../../../../shared/enums/data-mart-status.enum';
import { cn } from '@owox/ui/lib/utils';
import { DataMartHealthStatus } from '../../../../shared/types';
import type { DataMartRunItem } from '../../../../edit/model/types/data-mart-run';
import { usePrefetchOnHover } from '../../../../../../shared/hooks/usePrefetchOnHover';

interface DataMartHealthStatusCellProps {
  row: { original: DataMartListItem };
}

const RUN_STATUS_TO_TYPE: Record<DataMartRunStatus, StatusTypeEnum> = {
  [DataMartRunStatus.SUCCESS]: StatusTypeEnum.SUCCESS,
  [DataMartRunStatus.RUNNING]: StatusTypeEnum.INFO,
  [DataMartRunStatus.FAILED]: StatusTypeEnum.ERROR,
  [DataMartRunStatus.CANCELLED]: StatusTypeEnum.WARNING,
  [DataMartRunStatus.INTERRUPTED]: StatusTypeEnum.WARNING,
  [DataMartRunStatus.PENDING]: StatusTypeEnum.INFO,
  [DataMartRunStatus.RESTRICTED]: StatusTypeEnum.WARNING,
};

const HEALTH_STATUS_CONFIG: Record<
  DataMartHealthStatus,
  { text: string; dotClass: string; ringClass: string }
> = {
  [DataMartHealthStatus.NO_RUNS]: {
    text: 'No runs in the last 30 days',
    dotClass: 'bg-neutral-400 dark:bg-neutral-600',
    ringClass: 'ring-neutral-400/50',
  },
  [DataMartHealthStatus.ALL_RUNS_SUCCESS]: {
    text: 'All recent runs succeeded',
    dotClass: 'bg-green-500',
    ringClass: 'ring-green-500/50',
  },
  [DataMartHealthStatus.MIXED_RUNS]: {
    text: 'Mixed results in the last 30 days',
    dotClass: 'bg-yellow-500',
    ringClass: 'ring-yellow-500/50',
  },
  [DataMartHealthStatus.ALL_RUNS_FAILED]: {
    text: 'All recent runs failed',
    dotClass: 'bg-red-500',
    ringClass: 'ring-red-500/50',
  },
  [DataMartHealthStatus.RUNS_IN_PROGRESS]: {
    text: 'Some runs are in progress',
    dotClass: 'bg-blue-500',
    ringClass: 'ring-blue-500/50',
  },
};

const NOT_FETCHED_STATUS_STYLE = {
  dotClass: 'border border-neutral-400 bg-transparent',
  ringClass: 'ring-neutral-400/50',
} as const;

function getTooltipText(params: {
  healthStatus: DataMartHealthStatus;
  isLoading: boolean;
  isNotFetched: boolean;
}): string {
  const { healthStatus, isLoading, isNotFetched } = params;

  if (isLoading) return 'Loading run status...';
  if (isNotFetched) return 'Hover to load run status';

  return HEALTH_STATUS_CONFIG[healthStatus].text;
}

interface HealthStatusRowProps {
  label: string;
  run: DataMartRunItem | null;
}

function HealthStatusRow({ label, run }: HealthStatusRowProps) {
  return (
    <HoverCardItem>
      <HoverCardItemLabel>{label}</HoverCardItemLabel>
      <HoverCardItemValue>
        {run ? (
          <StatusLabel type={RUN_STATUS_TO_TYPE[run.status]} variant='ghost'>
            <RelativeTime date={run.createdAt} /> ({run.triggerType})
          </StatusLabel>
        ) : (
          <span className='text-muted-foreground text-sm'>No runs</span>
        )}
      </HoverCardItemValue>
    </HoverCardItem>
  );
}

export const DataMartHealthStatusCell = ({ row }: DataMartHealthStatusCellProps) => {
  const { navigate } = useProjectRoute();
  const dataMart = row.original;

  const isDraft = dataMart.status.code === DataMartStatus.DRAFT;

  const { healthStatus, isLoading, isFetched, latestRunsByType } = useDataMartHealthStatus(
    dataMart.id
  );

  const { prefetch } = useDataMartHealthStatus(dataMart.id);

  const hoverHandlers = usePrefetchOnHover({
    prefetch,
  });

  if (isDraft) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className='group inline-flex h-6 w-6 items-center justify-center'>
            <div className='relative'>
              <div className='h-2 w-2 rounded-full bg-neutral-300 dark:bg-neutral-700' />
              <div className='pointer-events-none absolute -inset-[3px] rounded-full opacity-0 ring-1 ring-neutral-300/50 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100' />
            </div>
          </div>
        </TooltipTrigger>

        <TooltipContent side='top' align='center'>
          Draft Data Mart is not available to run. Publish it to activate runs.
        </TooltipContent>
      </Tooltip>
    );
  }

  const showConnectorRun = dataMart.definitionType === DataMartDefinitionType.CONNECTOR;
  const isNotFetched = !isFetched;

  const { dotClass, ringClass } = isFetched
    ? HEALTH_STATUS_CONFIG[healthStatus]
    : NOT_FETCHED_STATUS_STYLE;

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div
          className='group inline-flex h-6 w-6 cursor-pointer items-center justify-center'
          {...hoverHandlers}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <div className='relative'>
                {/* Dot */}
                <div
                  className={cn(
                    'h-2 w-2 rounded-full transition-colors',
                    dotClass,
                    // Loading animation
                    isLoading && 'animate-pulse'
                  )}
                />

                {/* Ring / halo */}
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
              {getTooltipText({
                healthStatus,
                isLoading,
                isNotFetched,
              })}
            </TooltipContent>
          </Tooltip>
        </div>
      </HoverCardTrigger>

      {isFetched && !isLoading && (
        <HoverCardContent side='right' align='start'>
          <HoverCardHeader>
            <HoverCardHeaderText>
              <HoverCardHeaderTitle>{dataMart.title}</HoverCardHeaderTitle>
              <HoverCardHeaderDescription>
                Recent run history for last 30 days
              </HoverCardHeaderDescription>
            </HoverCardHeaderText>
          </HoverCardHeader>

          <HoverCardBody>
            {showConnectorRun && (
              <HealthStatusRow label='Connector run' run={latestRunsByType.connector} />
            )}

            <HealthStatusRow label='Report run' run={latestRunsByType.report} />
            <HealthStatusRow label='Insight run' run={latestRunsByType.insight} />
          </HoverCardBody>

          <HoverCardFooter>
            <Button
              className='w-full'
              onClick={() => {
                navigate(`/data-marts/${dataMart.id}/run-history`);
              }}
            >
              View Full Run History
              <ChevronRight className='h-4 w-4' />
            </Button>
          </HoverCardFooter>
        </HoverCardContent>
      )}
    </HoverCard>
  );
};

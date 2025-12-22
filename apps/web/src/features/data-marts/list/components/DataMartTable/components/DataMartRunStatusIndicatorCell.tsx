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

interface DataMartRunStatusIndicatorCellProps {
  row: { original: DataMartListItem };
}

export const DataMartRunStatusIndicatorCell = ({ row }: DataMartRunStatusIndicatorCellProps) => {
  return (
    <HoverCard>
      <Tooltip>
        <TooltipTrigger asChild>
          <HoverCardTrigger asChild>
            <div
              className='group inline-flex h-6 w-6 cursor-pointer items-center justify-center'
              aria-label='Run status'
            >
              <div className='relative'>
                <div className='h-2 w-2 rounded-full bg-orange-300' />
                <div className='pointer-events-none absolute -inset-[3px] rounded-full opacity-0 ring-1 ring-orange-300/50 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100' />
              </div>
            </div>
          </HoverCardTrigger>
        </TooltipTrigger>

        <TooltipContent side='top' align='center'>
          Some recent runs failed
        </TooltipContent>
      </Tooltip>

      <HoverCardContent>
        <HoverCardHeader>
          <HoverCardHeaderText>
            <HoverCardHeaderTitle>{row.original.title}</HoverCardHeaderTitle>
            <HoverCardHeaderDescription>Recent run history</HoverCardHeaderDescription>
          </HoverCardHeaderText>
        </HoverCardHeader>

        <HoverCardBody>
          <HoverCardItem>
            <HoverCardItemLabel>Connector run</HoverCardItemLabel>
            <HoverCardItemValue>
              <StatusLabel type={StatusTypeEnum.SUCCESS} variant='ghost'>
                Yesterday at 11:12 PM (scheduled)
              </StatusLabel>
            </HoverCardItemValue>
          </HoverCardItem>

          <HoverCardItem>
            <HoverCardItemLabel>Report run</HoverCardItemLabel>
            <HoverCardItemValue>
              <StatusLabel type={StatusTypeEnum.ERROR} variant='ghost'>
                25 minutes ago (scheduled)
              </StatusLabel>
            </HoverCardItemValue>
          </HoverCardItem>

          <HoverCardItem>
            <HoverCardItemLabel>Insight run</HoverCardItemLabel>
            <HoverCardItemValue>
              <StatusLabel type={StatusTypeEnum.SUCCESS} variant='ghost'>
                1 minute ago (manual)
              </StatusLabel>
            </HoverCardItemValue>
          </HoverCardItem>
        </HoverCardBody>

        <HoverCardFooter>
          <Button
            className='w-full'
            variant='default'
            title='View Full Run History'
            aria-label='View Full Run History'
          >
            View Full Run History
            <ChevronRight className='h-4 w-4' aria-hidden='true' />
          </Button>
        </HoverCardFooter>
      </HoverCardContent>
    </HoverCard>
  );
};

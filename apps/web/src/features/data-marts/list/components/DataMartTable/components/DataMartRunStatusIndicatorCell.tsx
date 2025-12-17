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
import { StatusLabel, StatusTypeEnum } from '../../../../../../shared/components/StatusLabel';
import { Button } from '@owox/ui/components/button';
import { ChevronRight } from 'lucide-react';

interface DataMartRunStatusIndicatorCellProps {
  row: { original: DataMartListItem };
}

export const DataMartRunStatusIndicatorCell = ({ row }: DataMartRunStatusIndicatorCellProps) => {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div className='h-2 w-2 rounded-full bg-green-500' />
      </HoverCardTrigger>
      <HoverCardContent>
        <HoverCardHeader>
          <HoverCardHeaderText>
            <HoverCardHeaderTitle>{row.original.title}</HoverCardHeaderTitle>
            <HoverCardHeaderDescription>
              <StatusLabel type={StatusTypeEnum.SUCCESS} variant='ghost' showIcon={false}>
                All last runs are successful
              </StatusLabel>
            </HoverCardHeaderDescription>
          </HoverCardHeaderText>
        </HoverCardHeader>

        <HoverCardBody>
          <HoverCardItem>
            <HoverCardItemLabel>Connector run:</HoverCardItemLabel>
            <HoverCardItemValue>
              <StatusLabel type={StatusTypeEnum.SUCCESS} variant='ghost'>
                5 minutes ago
              </StatusLabel>
            </HoverCardItemValue>
          </HoverCardItem>
          <HoverCardItem>
            <HoverCardItemLabel>Report run:</HoverCardItemLabel>
            <HoverCardItemValue>
              <StatusLabel type={StatusTypeEnum.SUCCESS} variant='ghost'>
                5 minutes ago
              </StatusLabel>
            </HoverCardItemValue>
          </HoverCardItem>
          <HoverCardItem>
            <HoverCardItemLabel>Insight run:</HoverCardItemLabel>
            <HoverCardItemValue>
              <StatusLabel type={StatusTypeEnum.SUCCESS} variant='ghost'>
                5 minutes ago
              </StatusLabel>
            </HoverCardItemValue>
          </HoverCardItem>
        </HoverCardBody>

        <HoverCardFooter>
          <Button
            className='w-full'
            variant='default'
            title='Open Run History'
            aria-label='Open Run History'
          >
            Open Run History
            <ChevronRight className='h-4 w-4' aria-hidden='true' />
          </Button>
        </HoverCardFooter>
      </HoverCardContent>
    </HoverCard>
  );
};

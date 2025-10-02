import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
  CollapsibleCardFooter,
} from '../../../shared/components/CollapsibleCard';
import { Timer } from 'lucide-react';
import {
  ScheduledTriggerList,
  ScheduledTriggerProvider,
} from '../../../features/data-marts/scheduled-triggers';
import { useDataMartContext } from '../../../features/data-marts/edit/model';
import { ConnectorContextProvider } from '../../../features/connectors/shared/model/context';

export function DataMartTriggersContent() {
  const { dataMart } = useDataMartContext();
  return (
    <CollapsibleCard>
      <CollapsibleCardHeader>
        <CollapsibleCardHeaderTitle
          icon={Timer}
          tooltip='Time triggers allow you to schedule Data Mart runs at specific times'
        >
          Time triggers
        </CollapsibleCardHeaderTitle>
      </CollapsibleCardHeader>
      <CollapsibleCardContent>
        <ConnectorContextProvider>
          <ScheduledTriggerProvider>
            {dataMart && <ScheduledTriggerList dataMartId={dataMart.id}></ScheduledTriggerList>}
          </ScheduledTriggerProvider>
        </ConnectorContextProvider>
      </CollapsibleCardContent>
      <CollapsibleCardFooter></CollapsibleCardFooter>
    </CollapsibleCard>
  );
}

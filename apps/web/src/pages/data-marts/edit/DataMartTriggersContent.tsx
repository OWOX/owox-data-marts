import { CollapsibleCard } from '../../../shared/components/CollapsibleCard';
import { CollapsibleCardContent } from '../../../shared/components/CollapsibleCard/CollapsibleCardContent.tsx';
import { CollapsibleCardHeader } from '../../../shared/components/CollapsibleCard/CollapsibleCardHeader.tsx';
import { CollapsibleCardFooter } from '../../../shared/components/CollapsibleCard/CollapsibleCardFooter.tsx';
import { Timer } from 'lucide-react';
import {
  ScheduledTriggerList,
  ScheduledTriggerProvider,
} from '../../../features/data-marts/scheduled-triggers';
import { useDataMartContext } from '../../../features/data-marts/edit/model';

export function DataMartTriggersContent() {
  const { dataMart } = useDataMartContext();
  return (
    <CollapsibleCard>
      <CollapsibleCardHeader icon={Timer} title={'Time triggers'}></CollapsibleCardHeader>
      <CollapsibleCardContent>
        <ScheduledTriggerProvider>
          {dataMart && <ScheduledTriggerList dataMartId={dataMart.id}></ScheduledTriggerList>}
        </ScheduledTriggerProvider>
      </CollapsibleCardContent>
      <CollapsibleCardFooter></CollapsibleCardFooter>
    </CollapsibleCard>
  );
}

import { DataMartRunHistory } from '../../../features/data-marts/edit/components/DataMartRunHistory';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
} from '../../../shared/components/CollapsibleCard';
import { HistoryIcon } from 'lucide-react';

export default function DataMartRunHistoryContent() {
  return (
    <div className='flex flex-col gap-4'>
      <CollapsibleCard collapsible={false} name='run-history'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={HistoryIcon}
            tooltip='View all Data Mart execution runs with detailed logs and errors'
          >
            Run History
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <DataMartRunHistory />
        </CollapsibleCardContent>
      </CollapsibleCard>
    </div>
  );
}

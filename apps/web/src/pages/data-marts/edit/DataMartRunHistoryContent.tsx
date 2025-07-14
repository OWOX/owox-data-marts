import { DataMartRunHistory } from '../../../features/data-marts/edit/components/DataMartRunHistory';
import { CollapsibleCard } from '../../../shared/components/CollapsibleCard';
import { CollapsibleCardContent } from '../../../shared/components/CollapsibleCard/CollapsibleCardContent';
import { CollapsibleCardHeader } from '../../../shared/components/CollapsibleCard/CollapsibleCardHeader';
import { HistoryIcon } from 'lucide-react';

export default function DataMartRunHistoryContent() {
  return (
    <div className='flex flex-col gap-4'>
      <CollapsibleCard collapsible={false} name='run-history'>
        <CollapsibleCardHeader
          icon={HistoryIcon}
          title='Run History'
          subtitle='View all Data Mart execution runs with detailed logs and errors'
        />
        <CollapsibleCardContent>
          <DataMartRunHistory />
        </CollapsibleCardContent>
      </CollapsibleCard>
    </div>
  );
}

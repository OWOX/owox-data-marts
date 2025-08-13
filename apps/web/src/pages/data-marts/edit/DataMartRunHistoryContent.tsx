import { Button } from '@owox/ui/components/button';
import { DataMartRunHistory } from '../../../features/data-marts/edit/components/DataMartRunHistory';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
  CollapsibleCardHeaderActions,
} from '../../../shared/components/CollapsibleCard';
import { HistoryIcon, RefreshCw } from 'lucide-react';
import { useDataMartContext } from '../../../features/data-marts/edit/model';

export default function DataMartRunHistoryContent() {
  const { dataMart, isLoading, getDataMartRuns } = useDataMartContext();

  const loadRunHistory = async () => {
    if (!dataMart?.id) return;
    await getDataMartRuns(dataMart.id, 20, 0);
  };
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
          <CollapsibleCardHeaderActions>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void loadRunHistory()}
              disabled={isLoading}
              className='flex cursor-pointer items-center gap-2'
            >
              <RefreshCw className='h-4 w-4' />
              Refresh
            </Button>
          </CollapsibleCardHeaderActions>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <DataMartRunHistory />
        </CollapsibleCardContent>
      </CollapsibleCard>
    </div>
  );
}

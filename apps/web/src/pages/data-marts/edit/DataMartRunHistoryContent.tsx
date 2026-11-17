import { useOutletContext } from 'react-router';
import { DataMartRunHistory } from '../../../features/data-marts/edit/components/DataMartRunHistory';
import { RefreshRunsButton } from '../../../features/data-marts/edit/components/DataMartRunHistoryView';
import { DATA_MART_RUNS_PAGE_SIZE } from '../../../features/data-marts/edit/constants';
import type { DataMartContextType } from '../../../features/data-marts/edit/model/context/types';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardHeaderActions,
  CollapsibleCardContent,
} from '../../../shared/components/CollapsibleCard';
import { HistoryIcon } from 'lucide-react';

export default function DataMartRunHistoryContent() {
  const { dataMart, getDataMartRuns } = useOutletContext<DataMartContextType>();

  return (
    <div className='flex flex-col gap-4' data-testid='runHistoryTab'>
      <CollapsibleCard collapsible={false} name='run-history'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={HistoryIcon}
            tooltip='View all Data Mart execution runs with detailed logs and errors'
          >
            Run History
          </CollapsibleCardHeaderTitle>
          {dataMart && (
            <CollapsibleCardHeaderActions>
              <RefreshRunsButton
                onRefresh={() =>
                  getDataMartRuns(dataMart.id, DATA_MART_RUNS_PAGE_SIZE, 0, { silent: true })
                }
              />
            </CollapsibleCardHeaderActions>
          )}
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <DataMartRunHistory />
        </CollapsibleCardContent>
      </CollapsibleCard>
    </div>
  );
}

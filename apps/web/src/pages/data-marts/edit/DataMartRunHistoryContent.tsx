import { DataMartRunHistory } from '../../../features/data-marts/edit/components/DataMartRunHistory';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
} from '../../../shared/components/CollapsibleCard';
import { HistoryIcon } from 'lucide-react';
import { useDataMartContext } from '../../../features/data-marts/edit/model';
import { useAutoRefresh } from '../../../hooks/useAutoRefresh.ts';

const REFRESH_INTERVAL_MS = 5000;
const INITIAL_RUNS_LIMIT = 20;

export default function DataMartRunHistoryContent() {
  const { dataMart, getDataMartRuns } = useDataMartContext();

  useAutoRefresh({
    enabled: !!dataMart?.id,
    intervalMs: REFRESH_INTERVAL_MS,
    onTick: () => {
      if (dataMart?.id) {
        void getDataMartRuns(dataMart.id, INITIAL_RUNS_LIMIT, 0, { silent: true });
      }
    },
  });

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

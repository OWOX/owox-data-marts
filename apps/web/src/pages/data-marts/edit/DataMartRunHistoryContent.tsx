import { DataMartRunHistory } from '../../../features/data-marts/edit/components/DataMartRunHistory';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
  CollapsibleCardHeaderActions,
} from '../../../shared/components/CollapsibleCard';
import { HistoryIcon } from 'lucide-react';
import { useDataMartContext } from '../../../features/data-marts/edit/model';
import { Checkbox } from '@owox/ui/components/checkbox';
import { useEffect, useMemo, useState } from 'react';
import { storageService } from '../../../services';
import { useAutoRefresh } from '../../../hooks/useAutoRefresh.ts';

const REFRESH_INTERVAL_MS = 5000;
const INITIAL_RUNS_LIMIT = 20;

export default function DataMartRunHistoryContent() {
  const { dataMart, getDataMartRuns } = useDataMartContext();

  const autoRefreshStorageKey = useMemo(() => {
    if (!dataMart?.id) return '';
    return `data-mart-run-history-auto-refresh-${dataMart.id}`;
  }, [dataMart?.id]);

  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(() => {
    if (!autoRefreshStorageKey) return false;
    const stored = storageService.get(autoRefreshStorageKey, 'boolean');
    return stored ?? false;
  });

  useEffect(() => {
    if (!autoRefreshStorageKey) return;
    storageService.set(autoRefreshStorageKey, autoRefreshEnabled);
  }, [autoRefreshEnabled, autoRefreshStorageKey]);

  useAutoRefresh({
    enabled: !!dataMart?.id && autoRefreshEnabled,
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
          <CollapsibleCardHeaderActions>
            <div className='flex items-center gap-2 pl-3'>
              <Checkbox
                id={`run-history-auto-refresh-${dataMart?.id ?? 'unknown'}`}
                checked={autoRefreshEnabled}
                onCheckedChange={val => {
                  setAutoRefreshEnabled(!!val);
                }}
                aria-label='Auto refresh'
              />
              <label
                htmlFor={`run-history-auto-refresh-${dataMart?.id ?? 'unknown'}`}
                className='text-sm'
              >
                Auto refresh
              </label>
            </div>
          </CollapsibleCardHeaderActions>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <DataMartRunHistory />
        </CollapsibleCardContent>
      </CollapsibleCard>
    </div>
  );
}

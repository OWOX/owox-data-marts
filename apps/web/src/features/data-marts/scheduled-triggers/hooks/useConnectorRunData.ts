import { useEffect, useMemo } from 'react';
import { useDataMartContext } from '../../edit/model/context';
import { getRunDataInfo } from '../../shared/utils/run-data.utils';
import type { ScheduledTrigger } from '../model/scheduled-trigger.model';
import { ScheduledTriggerType } from '../enums';

export function useConnectorRunData(trigger: ScheduledTrigger) {
  const { runs, getDataMartRuns } = useDataMartContext();

  useEffect(() => {
    if (trigger.type === ScheduledTriggerType.CONNECTOR_RUN && trigger.dataMart?.id) {
      void getDataMartRuns(trigger.dataMart.id);
    }
  }, [trigger.type, trigger.dataMart?.id, getDataMartRuns]);

  return useMemo(() => {
    if (trigger.type !== ScheduledTriggerType.CONNECTOR_RUN) {
      return getRunDataInfo([]);
    }

    return getRunDataInfo(runs);
  }, [trigger.type, runs]);
}

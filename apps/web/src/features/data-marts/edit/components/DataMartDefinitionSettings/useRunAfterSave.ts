import { useContext } from 'react';
import { DataMartContext } from '../../model/context/context';
import { isDataStorageConfigValid } from '../../../../data-storage';
import { RunType } from '../../../../connectors/shared/enums/run-type.enum';
import { DataMartStatus } from '../../../shared/enums';

/**
 * Save & Run of the connector setup sheet: whether it is offered, and the run after the save.
 * Outside a Data Mart provider it is never offered.
 */
export function useRunAfterSave() {
  const context = useContext(DataMartContext);
  const dataMart = context?.dataMart;
  // A run needs a configured Storage and no active run; otherwise the sheet only saves.
  const canRunAfterSave =
    !!dataMart?.storage && isDataStorageConfigValid(dataMart.storage) && !context?.hasActiveRuns;

  // Publishing a draft starts its first run on the backend, so only a published one runs here.
  const runSavedDataMart = async () => {
    if (!context || !dataMart) return;
    if (dataMart.status.code === DataMartStatus.DRAFT) {
      try {
        await context.publishDataMart(dataMart.id);
        // The context keeps the refresh error; the run itself has started.
        void context.getDataMartRuns(dataMart.id).catch(() => undefined);
      } catch {
        // The API client shows the error; the saved definition stays.
      }
      return;
    }
    await context.runDataMart({ id: dataMart.id, payload: { runType: RunType.INCREMENTAL } });
  };

  return { canRunAfterSave, runSavedDataMart };
}

import type { UserProjection } from '../../../shared/types';
import type { DataMart } from '../../../features/data-marts/edit/model/types';
import type { DataMartContextType } from '../../../features/data-marts/edit/model/context/types';
import { DataMartStatus, DataMartStatusModel } from '../../../features/data-marts/shared';
import type { DataMartDefinitionType } from '../../../features/data-marts/shared';
import { DataStorageType } from '../../../features/data-storage/shared/model/types/data-storage-type.enum';
import type { DataStorage } from '../../../features/data-storage/shared/model/types/data-storage';

interface ProjectDataMartContextRef {
  id: string;
  title: string;
  definitionType?: DataMartDefinitionType | null;
  createdAt?: Date;
  modifiedAt?: Date;
  createdByUser?: UserProjection | null;
  storage?: DataStorage | null;
}

export function buildProjectDataMartContextValue(
  dataMartRef: ProjectDataMartContextRef
): DataMartContextType {
  const fallbackDate = new Date(0);
  const dataMart = {
    id: dataMartRef.id,
    title: dataMartRef.title,
    description: null,
    status: DataMartStatusModel.getInfo(DataMartStatus.PUBLISHED),
    storage: dataMartRef.storage ?? buildFallbackStorage(fallbackDate),
    definitionType: dataMartRef.definitionType ?? null,
    definition: null,
    canPublish: false,
    validationErrors: [],
    createdAt: dataMartRef.createdAt ?? fallbackDate,
    modifiedAt: dataMartRef.modifiedAt ?? fallbackDate,
    schema: null,
    canActualizeSchema: false,
    connectorState: null,
    blendedFieldsConfig: null,
    createdByUser: dataMartRef.createdByUser ?? null,
    businessOwnerUsers: [],
    technicalOwnerUsers: [],
    availableForReporting: true,
    availableForMaintenance: true,
    contexts: [],
  } as unknown as DataMart;

  const noopPromise = () => Promise.resolve();

  return {
    dataMart,
    isLoading: false,
    isLoadingMoreRuns: false,
    error: null,
    runs: [],
    isManualRunTriggered: false,
    hasMoreRunsToLoad: false,
    hasActiveRuns: false,
    getDataMart: noopPromise,
    syncDataMartFromResponse: noopPromise,
    refreshDataMart: noopPromise,
    createDataMart: () => Promise.resolve({ id: dataMart.id, title: dataMart.title }),
    updateDataMart: noopPromise,
    deleteDataMart: noopPromise,
    updateDataMartTitle: noopPromise,
    updateDataMartDescription: noopPromise,
    updateDataMartStorage: () => undefined,
    updateDataMartDefinition: noopPromise,
    publishDataMart: noopPromise,
    runDataMart: noopPromise,
    cancelDataMartRun: noopPromise,
    actualizeDataMartSchema: noopPromise,
    updateDataMartSchema: noopPromise,
    getDataMartRuns: () => Promise.resolve([]),
    getDataMartRunById: () =>
      Promise.reject(new Error('Data Mart run details are not available from project lists.')),
    loadMoreDataMartRuns: () => Promise.resolve([]),
    updateDataMartOwners: noopPromise,
    getErrorMessage: () => null,
    resetManualRunTriggered: () => undefined,
    reset: () => undefined,
  } as DataMartContextType;
}

function buildFallbackStorage(fallbackDate: Date): DataStorage {
  return {
    id: '',
    title: '',
    type: DataStorageType.GOOGLE_BIGQUERY,
    credentials: null,
    config: null,
    createdAt: fallbackDate,
    modifiedAt: fallbackDate,
  } as unknown as DataStorage;
}

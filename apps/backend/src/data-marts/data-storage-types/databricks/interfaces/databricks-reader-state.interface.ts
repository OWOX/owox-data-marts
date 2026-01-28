import { DataStorageType } from '../../enums/data-storage-type.enum';

export interface DatabricksReaderState {
  type: DataStorageType.DATABRICKS;
  queryId: string;
  rowsRead: number;
  hasMore: boolean;
}

export function isDatabricksReaderState(state: unknown): state is DatabricksReaderState {
  return (
    typeof state === 'object' &&
    state !== null &&
    'type' in state &&
    (state as DatabricksReaderState).type === DataStorageType.DATABRICKS &&
    'queryId' in state &&
    typeof (state as DatabricksReaderState).queryId === 'string' &&
    'rowsRead' in state &&
    typeof (state as DatabricksReaderState).rowsRead === 'number' &&
    'hasMore' in state &&
    typeof (state as DatabricksReaderState).hasMore === 'boolean'
  );
}

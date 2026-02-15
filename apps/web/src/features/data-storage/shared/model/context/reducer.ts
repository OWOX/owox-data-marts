import type { DataStorageList, DataStorageListItem } from '../types/data-storage-list.ts';
import type { DataStorage } from '../types/data-storage.ts';
import { type DataStorageAction, DataStorageActionType } from './types.ts';
import { type ApiError } from '../../../../../app/api';

export interface DataStorageState {
  dataStorages: DataStorageList;
  currentDataStorage: DataStorage | null;
  loading: boolean;
  error: ApiError | null;
}

export const initialDataStorageState: DataStorageState = {
  dataStorages: [],
  currentDataStorage: null,
  loading: false,
  error: null,
};

export function reducer(state: DataStorageState, action: DataStorageAction): DataStorageState {
  switch (action.type) {
    case DataStorageActionType.FETCH_STORAGES_START:
    case DataStorageActionType.FETCH_STORAGE_START:
    case DataStorageActionType.CREATE_STORAGE_START:
    case DataStorageActionType.UPDATE_STORAGE_START:
    case DataStorageActionType.PUBLISH_DRAFTS_START:
      return {
        ...state,
        error: null,
      };
    case DataStorageActionType.DELETE_STORAGE_START:
      return {
        ...state,
        loading: true,
        error: null,
      };
    case DataStorageActionType.FETCH_STORAGES_SUCCESS:
      return {
        ...state,
        dataStorages: action.payload,
        loading: false,
        error: null,
      };
    case DataStorageActionType.FETCH_STORAGE_SUCCESS:
      return {
        ...state,
        currentDataStorage: action.payload,
        loading: false,
        error: null,
      };
    case DataStorageActionType.CREATE_STORAGE_SUCCESS:
      return {
        ...state,
        dataStorages: [
          ...state.dataStorages,
          { ...action.payload, dataMartsCount: 0, draftsCount: 0 } as DataStorageListItem,
        ],
        loading: false,
        error: null,
      };
    case DataStorageActionType.UPDATE_STORAGE_SUCCESS:
      return {
        ...state,
        currentDataStorage: action.payload,
        dataStorages: state.dataStorages.map(ds =>
          ds.id === action.payload.id
            ? ({
                ...action.payload,
                dataMartsCount: ds.dataMartsCount,
                draftsCount: ds.draftsCount,
              } as DataStorageListItem)
            : ds
        ),
        loading: false,
        error: null,
      };
    case DataStorageActionType.DELETE_STORAGE_SUCCESS:
      return {
        ...state,
        dataStorages: state.dataStorages.filter(ds => ds.id !== action.payload),
        loading: false,
        error: null,
      };
    case DataStorageActionType.PUBLISH_DRAFTS_SUCCESS:
      return {
        ...state,
        loading: false,
        error: null,
      };
    case DataStorageActionType.FETCH_STORAGES_ERROR:
    case DataStorageActionType.FETCH_STORAGE_ERROR:
    case DataStorageActionType.CREATE_STORAGE_ERROR:
    case DataStorageActionType.UPDATE_STORAGE_ERROR:
    case DataStorageActionType.DELETE_STORAGE_ERROR:
    case DataStorageActionType.PUBLISH_DRAFTS_ERROR:
      return {
        ...state,
        loading: false,
        error: action.payload,
      };

    case DataStorageActionType.CLEAR_CURRENT_STORAGE:
      return {
        ...state,
        currentDataStorage: null,
      };
    case DataStorageActionType.CLEAR_ERROR:
      return {
        ...state,
        error: null,
      };
    default:
      return state;
  }
}

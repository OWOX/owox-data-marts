import type { DataStorageList } from '../types/data-storage-list.ts';
import type { DataStorage } from '../types/data-storage.ts';
import { type DataStorageAction, DataStorageActionType } from './types.ts';

export interface DataStorageState {
  dataStorages: DataStorageList;
  currentDataStorage: DataStorage | null;
  loading: boolean;
  error: string | null;
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
        dataStorages: [...state.dataStorages, action.payload],
        loading: false,
        error: null,
      };
    case DataStorageActionType.UPDATE_STORAGE_SUCCESS:
      return {
        ...state,
        currentDataStorage: action.payload,
        dataStorages: state.dataStorages.map(ds =>
          ds.id === action.payload.id ? action.payload : ds
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
    case DataStorageActionType.FETCH_STORAGES_ERROR:
    case DataStorageActionType.FETCH_STORAGE_ERROR:
    case DataStorageActionType.CREATE_STORAGE_ERROR:
    case DataStorageActionType.UPDATE_STORAGE_ERROR:
    case DataStorageActionType.DELETE_STORAGE_ERROR:
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

import React from 'react';
import type { DataStorageList } from '../types/data-storage-list.ts';
import type { DataStorage } from '../types/data-storage.ts';
import type { DataStorageState } from './reducer.ts';
import type { ApiError } from '../../../../../app/api';

export enum DataStorageActionType {
  FETCH_STORAGES_START = 'FETCH_STORAGES_START',
  FETCH_STORAGES_SUCCESS = 'FETCH_STORAGES_SUCCESS',
  FETCH_STORAGES_ERROR = 'FETCH_STORAGES_ERROR',

  FETCH_STORAGE_START = 'FETCH_STORAGE_START',
  FETCH_STORAGE_SUCCESS = 'FETCH_STORAGE_SUCCESS',
  FETCH_STORAGE_ERROR = 'FETCH_STORAGE_ERROR',
  CLEAR_CURRENT_STORAGE = 'CLEAR_CURRENT_STORAGE',

  CREATE_STORAGE_START = 'CREATE_STORAGE_START',
  CREATE_STORAGE_SUCCESS = 'CREATE_STORAGE_SUCCESS',
  CREATE_STORAGE_ERROR = 'CREATE_STORAGE_ERROR',

  UPDATE_STORAGE_START = 'UPDATE_STORAGE_START',
  UPDATE_STORAGE_SUCCESS = 'UPDATE_STORAGE_SUCCESS',
  UPDATE_STORAGE_ERROR = 'UPDATE_STORAGE_ERROR',

  DELETE_STORAGE_START = 'DELETE_STORAGE_START',
  DELETE_STORAGE_SUCCESS = 'DELETE_STORAGE_SUCCESS',
  DELETE_STORAGE_ERROR = 'DELETE_STORAGE_ERROR',

  PUBLISH_DRAFTS_START = 'PUBLISH_DRAFTS_START',
  PUBLISH_DRAFTS_SUCCESS = 'PUBLISH_DRAFTS_SUCCESS',
  PUBLISH_DRAFTS_ERROR = 'PUBLISH_DRAFTS_ERROR',

  CLEAR_ERROR = 'CLEAR_ERROR',
}

export type DataStorageAction =
  | { type: DataStorageActionType.FETCH_STORAGES_START }
  | { type: DataStorageActionType.FETCH_STORAGES_SUCCESS; payload: DataStorageList }
  | { type: DataStorageActionType.FETCH_STORAGES_ERROR; payload: ApiError | null }
  | { type: DataStorageActionType.FETCH_STORAGE_START }
  | { type: DataStorageActionType.FETCH_STORAGE_SUCCESS; payload: DataStorage }
  | { type: DataStorageActionType.FETCH_STORAGE_ERROR; payload: ApiError | null }
  | { type: DataStorageActionType.CREATE_STORAGE_START }
  | { type: DataStorageActionType.CREATE_STORAGE_SUCCESS; payload: DataStorage }
  | { type: DataStorageActionType.CREATE_STORAGE_ERROR; payload: ApiError | null }
  | { type: DataStorageActionType.UPDATE_STORAGE_START }
  | { type: DataStorageActionType.UPDATE_STORAGE_SUCCESS; payload: DataStorage }
  | { type: DataStorageActionType.UPDATE_STORAGE_ERROR; payload: ApiError | null }
  | { type: DataStorageActionType.DELETE_STORAGE_START }
  | { type: DataStorageActionType.DELETE_STORAGE_SUCCESS; payload: string }
  | { type: DataStorageActionType.DELETE_STORAGE_ERROR; payload: ApiError | null }
  | { type: DataStorageActionType.PUBLISH_DRAFTS_START }
  | { type: DataStorageActionType.PUBLISH_DRAFTS_SUCCESS }
  | { type: DataStorageActionType.PUBLISH_DRAFTS_ERROR; payload: ApiError | null }
  | { type: DataStorageActionType.CLEAR_CURRENT_STORAGE }
  | { type: DataStorageActionType.CLEAR_ERROR };

export interface DataStorageContextValue {
  state: DataStorageState;
  dispatch: React.Dispatch<DataStorageAction>;
}

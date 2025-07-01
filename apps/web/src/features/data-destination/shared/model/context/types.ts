import React from 'react';
import type { DataDestinationList } from '../types';
import type { DataDestination } from '../types';
import type { DataDestinationState } from './reducer.ts';

export enum DataDestinationActionType {
  FETCH_DESTINATIONS_START = 'FETCH_DESTINATIONS_START',
  FETCH_DESTINATIONS_SUCCESS = 'FETCH_DESTINATIONS_SUCCESS',
  FETCH_DESTINATIONS_ERROR = 'FETCH_DESTINATIONS_ERROR',

  FETCH_DESTINATION_START = 'FETCH_DESTINATION_START',
  FETCH_DESTINATION_SUCCESS = 'FETCH_DESTINATION_SUCCESS',
  FETCH_DESTINATION_ERROR = 'FETCH_DESTINATION_ERROR',
  CLEAR_CURRENT_DESTINATION = 'CLEAR_CURRENT_DESTINATION',

  CREATE_DESTINATION_START = 'CREATE_DESTINATION_START',
  CREATE_DESTINATION_SUCCESS = 'CREATE_DESTINATION_SUCCESS',
  CREATE_DESTINATION_ERROR = 'CREATE_DESTINATION_ERROR',

  UPDATE_DESTINATION_START = 'UPDATE_DESTINATION_START',
  UPDATE_DESTINATION_SUCCESS = 'UPDATE_DESTINATION_SUCCESS',
  UPDATE_DESTINATION_ERROR = 'UPDATE_DESTINATION_ERROR',

  DELETE_DESTINATION_START = 'DELETE_DESTINATION_START',
  DELETE_DESTINATION_SUCCESS = 'DELETE_DESTINATION_SUCCESS',
  DELETE_DESTINATION_ERROR = 'DELETE_DESTINATION_ERROR',

  CLEAR_ERROR = 'CLEAR_ERROR',
}

export type DataDestinationAction =
  | { type: DataDestinationActionType.FETCH_DESTINATIONS_START }
  | { type: DataDestinationActionType.FETCH_DESTINATIONS_SUCCESS; payload: DataDestinationList }
  | { type: DataDestinationActionType.FETCH_DESTINATIONS_ERROR; payload: string }
  | { type: DataDestinationActionType.FETCH_DESTINATION_START }
  | { type: DataDestinationActionType.FETCH_DESTINATION_SUCCESS; payload: DataDestination }
  | { type: DataDestinationActionType.FETCH_DESTINATION_ERROR; payload: string }
  | { type: DataDestinationActionType.CREATE_DESTINATION_START }
  | { type: DataDestinationActionType.CREATE_DESTINATION_SUCCESS; payload: DataDestination }
  | { type: DataDestinationActionType.CREATE_DESTINATION_ERROR; payload: string }
  | { type: DataDestinationActionType.UPDATE_DESTINATION_START }
  | { type: DataDestinationActionType.UPDATE_DESTINATION_SUCCESS; payload: DataDestination }
  | { type: DataDestinationActionType.UPDATE_DESTINATION_ERROR; payload: string }
  | { type: DataDestinationActionType.DELETE_DESTINATION_START }
  | { type: DataDestinationActionType.DELETE_DESTINATION_SUCCESS; payload: string }
  | { type: DataDestinationActionType.DELETE_DESTINATION_ERROR; payload: string }
  | { type: DataDestinationActionType.CLEAR_CURRENT_DESTINATION }
  | { type: DataDestinationActionType.CLEAR_ERROR };

export interface DataDestinationContextValue {
  state: DataDestinationState;
  dispatch: React.Dispatch<DataDestinationAction>;
}

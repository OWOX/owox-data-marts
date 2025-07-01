import type { DataDestinationList } from '../types';
import type { DataDestination } from '../types';
import { type DataDestinationAction, DataDestinationActionType } from './types.ts';

export interface DataDestinationState {
  dataDestinations: DataDestinationList;
  currentDataDestination: DataDestination | null;
  loading: boolean;
  error: string | null;
}

export const initialDataDestinationState: DataDestinationState = {
  dataDestinations: [],
  currentDataDestination: null,
  loading: false,
  error: null,
};

export function reducer(
  state: DataDestinationState,
  action: DataDestinationAction
): DataDestinationState {
  switch (action.type) {
    case DataDestinationActionType.FETCH_DESTINATIONS_START:
    case DataDestinationActionType.FETCH_DESTINATION_START:
    case DataDestinationActionType.CREATE_DESTINATION_START:
    case DataDestinationActionType.UPDATE_DESTINATION_START:
    case DataDestinationActionType.DELETE_DESTINATION_START:
      return {
        ...state,
        loading: true,
        error: null,
      };
    case DataDestinationActionType.FETCH_DESTINATIONS_SUCCESS:
      return {
        ...state,
        dataDestinations: action.payload,
        loading: false,
        error: null,
      };
    case DataDestinationActionType.FETCH_DESTINATION_SUCCESS:
      return {
        ...state,
        currentDataDestination: action.payload,
        loading: false,
        error: null,
      };
    case DataDestinationActionType.CREATE_DESTINATION_SUCCESS:
      return {
        ...state,
        dataDestinations: [...state.dataDestinations, action.payload],
        loading: false,
        error: null,
      };
    case DataDestinationActionType.UPDATE_DESTINATION_SUCCESS:
      return {
        ...state,
        currentDataDestination: action.payload,
        dataDestinations: state.dataDestinations.map(ds =>
          ds.id === action.payload.id ? action.payload : ds
        ),
        loading: false,
        error: null,
      };
    case DataDestinationActionType.DELETE_DESTINATION_SUCCESS:
      return {
        ...state,
        dataDestinations: state.dataDestinations.filter(ds => ds.id !== action.payload),
        loading: false,
        error: null,
      };
    case DataDestinationActionType.FETCH_DESTINATIONS_ERROR:
    case DataDestinationActionType.FETCH_DESTINATION_ERROR:
    case DataDestinationActionType.CREATE_DESTINATION_ERROR:
    case DataDestinationActionType.UPDATE_DESTINATION_ERROR:
    case DataDestinationActionType.DELETE_DESTINATION_ERROR:
      return {
        ...state,
        loading: false,
        error: action.payload,
      };

    case DataDestinationActionType.CLEAR_CURRENT_DESTINATION:
      return {
        ...state,
        currentDataDestination: null,
      };
    case DataDestinationActionType.CLEAR_ERROR:
      return {
        ...state,
        error: null,
      };
    default:
      return state;
  }
}

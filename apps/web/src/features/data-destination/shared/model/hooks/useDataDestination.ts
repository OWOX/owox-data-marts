import { DataDestinationActionType, useDataDestinationContext } from '../context';
import { useCallback } from 'react';
import type { DataDestination } from '../types';
import { dataDestinationService } from '../../services';
import { mapDataDestinationFromDto } from '../mappers/data-destination.mapper';
import type {
  CreateDataDestinationRequestDto,
  UpdateDataDestinationRequestDto,
} from '../../services/types';

export function useDataDestination() {
  const { state, dispatch } = useDataDestinationContext();

  const fetchDataDestinations = useCallback(async () => {
    dispatch({ type: DataDestinationActionType.FETCH_DESTINATIONS_START });
    try {
      const response = await dataDestinationService.getDataDestinations();
      const mappedDestinations = response.map(mapDataDestinationFromDto);
      dispatch({
        type: DataDestinationActionType.FETCH_DESTINATIONS_SUCCESS,
        payload: mappedDestinations,
      });
    } catch (error) {
      dispatch({
        type: DataDestinationActionType.FETCH_DESTINATIONS_ERROR,
        payload: error instanceof Error ? error.message : 'Failed to load destinations',
      });
    }
  }, [dispatch]);

  const getDataDestinationById = useCallback(
    async (id: string) => {
      try {
        const response = await dataDestinationService.getDataDestinationById(id);
        const mappedDestination = mapDataDestinationFromDto(response);
        dispatch({
          type: DataDestinationActionType.FETCH_DESTINATION_SUCCESS,
          payload: mappedDestination,
        });
      } catch (error) {
        dispatch({
          type: DataDestinationActionType.FETCH_DESTINATION_ERROR,
          payload: error instanceof Error ? error.message : 'Failed to load destination',
        });
      }
    },
    [dispatch]
  );

  const createDataDestination = useCallback(
    async (requestData: CreateDataDestinationRequestDto) => {
      dispatch({ type: DataDestinationActionType.CREATE_DESTINATION_START });
      try {
        const response = await dataDestinationService.createDataDestination(requestData);
        const mappedDestination = mapDataDestinationFromDto(response);
        dispatch({
          type: DataDestinationActionType.CREATE_DESTINATION_SUCCESS,
          payload: mappedDestination,
        });
        return mappedDestination;
      } catch (error) {
        dispatch({
          type: DataDestinationActionType.CREATE_DESTINATION_ERROR,
          payload: error instanceof Error ? error.message : 'Failed to create destination',
        });
        return null;
      }
    },
    [dispatch]
  );

  const updateDataDestination = useCallback(
    async (id: DataDestination['id'], requestData: UpdateDataDestinationRequestDto) => {
      dispatch({ type: DataDestinationActionType.UPDATE_DESTINATION_START });
      try {
        const response = await dataDestinationService.updateDataDestination(id, requestData);
        const mappedDestination = mapDataDestinationFromDto(response);
        dispatch({
          type: DataDestinationActionType.UPDATE_DESTINATION_SUCCESS,
          payload: mappedDestination,
        });
        return mappedDestination;
      } catch (error) {
        dispatch({
          type: DataDestinationActionType.UPDATE_DESTINATION_ERROR,
          payload: error instanceof Error ? error.message : 'Failed to update destination',
        });
        return null;
      }
    },
    [dispatch]
  );

  const deleteDataDestination = useCallback(
    async (id: DataDestination['id']) => {
      dispatch({ type: DataDestinationActionType.DELETE_DESTINATION_START });
      try {
        await dataDestinationService.deleteDataDestination(id);
        dispatch({ type: DataDestinationActionType.DELETE_DESTINATION_SUCCESS, payload: id });
      } catch (error) {
        dispatch({
          type: DataDestinationActionType.DELETE_DESTINATION_ERROR,
          payload: error instanceof Error ? error.message : 'Failed to delete destination',
        });
      }
    },
    [dispatch]
  );

  const clearCurrentDataDestination = useCallback(() => {
    dispatch({ type: DataDestinationActionType.CLEAR_CURRENT_DESTINATION });
  }, [dispatch]);

  return {
    dataDestinations: state.dataDestinations,
    currentDataDestination: state.currentDataDestination,
    loading: state.loading,
    error: state.error,
    fetchDataDestinations,
    getDataDestinationById,
    createDataDestination,
    updateDataDestination,
    deleteDataDestination,
    clearCurrentDataDestination,
  };
}

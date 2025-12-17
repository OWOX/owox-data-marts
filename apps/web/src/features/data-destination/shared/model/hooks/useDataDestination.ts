import { DataDestinationActionType, useDataDestinationContext } from '../context';
import { useCallback } from 'react';
import type { DataDestination } from '../types';
import { dataDestinationService } from '../../services';
import { mapDataDestinationFromDto } from '../mappers/data-destination.mapper';
import type {
  CreateDataDestinationRequestDto,
  UpdateDataDestinationRequestDto,
} from '../../services/types';
import toast from 'react-hot-toast';
import { trackEvent } from '../../../../../utils/data-layer';

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
      const message = error instanceof Error ? error.message : 'Failed to load destinations';
      dispatch({
        type: DataDestinationActionType.FETCH_DESTINATIONS_ERROR,
        payload: message,
      });
      trackEvent({
        event: 'data_destination_error',
        category: 'DataDestination',
        action: 'ListError',
        error: message,
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
        const message = error instanceof Error ? error.message : 'Failed to load destination';
        dispatch({
          type: DataDestinationActionType.FETCH_DESTINATION_ERROR,
          payload: message,
        });
        trackEvent({
          event: 'data_destination_error',
          category: 'DataDestination',
          action: 'GetError',
          error: message,
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
        trackEvent({
          event: 'data_destination_created',
          category: 'DataDestination',
          action: 'Create',
          label: mappedDestination.type,
        });
        toast.success('Destination created');
        return mappedDestination;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create destination';
        dispatch({
          type: DataDestinationActionType.CREATE_DESTINATION_ERROR,
          payload: message,
        });
        trackEvent({
          event: 'data_destination_error',
          category: 'DataDestination',
          action: 'CreateError',
          label: requestData.type,
          error: message,
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
        trackEvent({
          event: 'data_destination_updated',
          category: 'DataDestination',
          action: 'Update',
          label: mappedDestination.type,
        });
        toast.success('Destination updated');
        return mappedDestination;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update destination';
        dispatch({
          type: DataDestinationActionType.UPDATE_DESTINATION_ERROR,
          payload: message,
        });
        trackEvent({
          event: 'data_destination_error',
          category: 'DataDestination',
          action: 'UpdateError',
          error: message,
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
        trackEvent({
          event: 'data_destination_deleted',
          category: 'DataDestination',
          action: 'Delete',
        });
        toast.success('Destination deleted');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete destination';
        dispatch({
          type: DataDestinationActionType.DELETE_DESTINATION_ERROR,
          payload: message,
        });
        trackEvent({
          event: 'data_destination_error',
          category: 'DataDestination',
          action: 'DeleteError',
          error: message,
        });
        throw error;
      }
    },
    [dispatch]
  );

  const clearCurrentDataDestination = useCallback(() => {
    dispatch({ type: DataDestinationActionType.CLEAR_CURRENT_DESTINATION });
  }, [dispatch]);

  const rotateSecretKey = useCallback(async (id: DataDestination['id']) => {
    try {
      const response = await dataDestinationService.rotateSecretKey(id);
      const destination = mapDataDestinationFromDto(response);
      trackEvent({
        event: 'data_destination_updated',
        category: 'DataDestination',
        action: 'RotateSecretKey',
        label: destination.type,
      });
      return destination;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to rotate secret key';
      trackEvent({
        event: 'data_destination_error',
        category: 'DataDestination',
        action: 'RotateSecretKeyError',
        error: message,
      });
      console.error('Failed to rotate secret key:', error);
      throw error;
    }
  }, []);

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
    rotateSecretKey,
  };
}

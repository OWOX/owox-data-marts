import { DataStorageActionType, useDataStorageContext } from '../context';
import { useCallback } from 'react';
import {
  mapDataStorageFromDto,
  mapDataStorageListFromDto,
  mapToCreateDataStorageRequest,
  mapToUpdateDataStorageRequest,
} from '../mappers';
import type { DataStorage } from '../types/data-storage.ts';
import { dataStorageApiService } from '../../api';
import { invalidateDataStorageHealthStatus } from '../../services/data-storage-health-status.service';
import type { DataStorageFormData } from '../../types/data-storage.schema.ts';
import { DataStorageType } from '../types';
import { extractApiError } from '../../../../../app/api';
import toast from 'react-hot-toast';
import { trackEvent } from '../../../../../utils/data-layer';
import { useRefreshSetupProgress } from '../../../../../components/AppSidebar/SetupChecklist/useSetupProgress';

export function useDataStorage() {
  const { state, dispatch } = useDataStorageContext();
  const refreshSetupProgress = useRefreshSetupProgress();

  const fetchDataStorages = useCallback(async () => {
    dispatch({ type: DataStorageActionType.FETCH_STORAGES_START });
    try {
      const response = await dataStorageApiService.getDataStorages();
      dispatch({
        type: DataStorageActionType.FETCH_STORAGES_SUCCESS,
        payload: response.map(mapDataStorageListFromDto),
      });
    } catch (error) {
      dispatch({
        type: DataStorageActionType.FETCH_STORAGES_ERROR,
        payload: extractApiError(error),
      });
      throw error;
    }
  }, [dispatch]);

  const getDataStorageById = useCallback(
    async (id: string) => {
      try {
        const response = await dataStorageApiService.getDataStorageById(id);
        const dataStorage = mapDataStorageFromDto(response);
        dispatch({ type: DataStorageActionType.FETCH_STORAGE_SUCCESS, payload: dataStorage });
      } catch (error) {
        dispatch({
          type: DataStorageActionType.FETCH_STORAGE_ERROR,
          payload: extractApiError(error),
        });
        throw error;
      }
    },
    [dispatch]
  );

  const createDataStorage = useCallback(
    async (type: DataStorageType) => {
      dispatch({ type: DataStorageActionType.CREATE_STORAGE_START });
      try {
        const request = mapToCreateDataStorageRequest(type);
        const response = await dataStorageApiService.createDataStorage(request);
        const newStorage = mapDataStorageFromDto(response);
        dispatch({
          type: DataStorageActionType.CREATE_STORAGE_SUCCESS,
          payload: newStorage,
        });

        trackEvent({
          event: 'data_storage_created',
          category: 'DataStorage',
          action: 'Create',
          label: newStorage.type,
          details: newStorage.title,
        });

        toast.success('Storage created');
        refreshSetupProgress();
        return newStorage;
      } catch (error) {
        dispatch({
          type: DataStorageActionType.CREATE_STORAGE_ERROR,
          payload: extractApiError(error),
        });
        return null;
      }
    },
    [dispatch, refreshSetupProgress]
  );

  const updateDataStorage = useCallback(
    async (
      id: DataStorage['id'],
      data: DataStorageFormData,
      source?: { id: string; title: string } | null
    ) => {
      dispatch({ type: DataStorageActionType.UPDATE_STORAGE_START });
      try {
        const { ownerIds, availableForUse, availableForMaintenance, contextIds, ...formData } =
          data as DataStorageFormData & {
            ownerIds?: string[];
            availableForUse?: boolean;
            availableForMaintenance?: boolean;
            contextIds?: string[];
          };
        const request = mapToUpdateDataStorageRequest(formData, source?.id);
        const requestWithExtras = {
          ...request,
          ...(ownerIds !== undefined && { ownerIds }),
          ...(availableForUse !== undefined && { availableForUse }),
          ...(availableForMaintenance !== undefined && { availableForMaintenance }),
          ...(contextIds !== undefined && { contextIds }),
        };
        const response = await dataStorageApiService.updateDataStorage(id, requestWithExtras);
        const updatedStorage = mapDataStorageFromDto(response);
        dispatch({
          type: DataStorageActionType.UPDATE_STORAGE_SUCCESS,
          payload: updatedStorage,
        });
        trackEvent({
          event: 'data_storage_updated',
          category: 'DataStorage',
          action: 'Update',
          label: updatedStorage.type,
          context: updatedStorage.id,
        });
        const toastMessage = source
          ? `Storage updated. Credentials copied from ${source.title}.`
          : 'Storage updated';
        toast.success(toastMessage);
        invalidateDataStorageHealthStatus(id);
        return updatedStorage;
      } catch (error) {
        dispatch({
          type: DataStorageActionType.UPDATE_STORAGE_ERROR,
          payload: extractApiError(error),
        });
        return null;
      }
    },
    [dispatch]
  );

  const deleteDataStorage = useCallback(
    async (id: DataStorage['id']) => {
      dispatch({ type: DataStorageActionType.DELETE_STORAGE_START });
      try {
        await dataStorageApiService.deleteDataStorage(id);
        dispatch({ type: DataStorageActionType.DELETE_STORAGE_SUCCESS, payload: id });
        trackEvent({
          event: 'data_storage_deleted',
          category: 'DataStorage',
          action: 'Delete',
          label: id,
        });
        toast.success('Storage deleted');
      } catch (error) {
        dispatch({
          type: DataStorageActionType.DELETE_STORAGE_ERROR,
          payload: extractApiError(error),
        });
        throw error;
      }
    },
    [dispatch]
  );

  const clearCurrentDataStorage = useCallback(() => {
    dispatch({ type: DataStorageActionType.CLEAR_CURRENT_STORAGE });
  }, [dispatch]);

  return {
    dataStorages: state.dataStorages,
    currentDataStorage: state.currentDataStorage,
    loading: state.loading,
    error: state.error,
    fetchDataStorages,
    getDataStorageById,
    createDataStorage,
    updateDataStorage,
    deleteDataStorage,
    clearCurrentDataStorage,
  };
}

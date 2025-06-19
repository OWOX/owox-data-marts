import { useReducer, type ReactNode, useCallback } from 'react';
import { DataMartContext } from './context.ts';
import { initialState, reducer } from './reducer.ts';
import { mapDataMartFromDto, mapLimitedDataMartFromDto } from '../mappers';
import { dataMartService } from '../../../shared';
import type { CreateDataMartRequestDto, UpdateDataMartRequestDto } from '../../../shared/types/api';

// Props interface
interface DataMartProviderProps {
  children: ReactNode;
}

// Provider component
export function DataMartProvider({ children }: DataMartProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Get a data mart by ID
  const getDataMart = useCallback(async (id: string) => {
    try {
      dispatch({ type: 'FETCH_DATA_MART_START' });
      const response = await dataMartService.getDataMartById(id);
      const dataMart = mapDataMartFromDto(response);
      dispatch({ type: 'FETCH_DATA_MART_SUCCESS', payload: dataMart });
    } catch (error) {
      dispatch({
        type: 'FETCH_DATA_MART_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to fetch data mart',
      });
    }
  }, []);

  // Create a new data mart
  const createDataMart = async (data: CreateDataMartRequestDto) => {
    try {
      dispatch({ type: 'CREATE_DATA_MART_START' });
      const response = await dataMartService.createDataMart(data);
      const dataMart = mapLimitedDataMartFromDto(response);
      dispatch({ type: 'CREATE_DATA_MART_SUCCESS', payload: dataMart });
      return dataMart;
    } catch (error) {
      dispatch({
        type: 'CREATE_DATA_MART_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to create data mart',
      });
      throw error;
    }
  };

  // Update an existing data mart
  const updateDataMart = async (id: string, data: UpdateDataMartRequestDto) => {
    try {
      dispatch({ type: 'UPDATE_DATA_MART_START' });
      const response = await dataMartService.updateDataMart(id, data);
      const dataMart = mapDataMartFromDto(response);
      dispatch({ type: 'UPDATE_DATA_MART_SUCCESS', payload: dataMart });
    } catch (error) {
      dispatch({
        type: 'UPDATE_DATA_MART_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to update data mart',
      });
    }
  };

  // Delete a data mart
  const deleteDataMart = async (id: string) => {
    try {
      dispatch({ type: 'DELETE_DATA_MART_START' });
      await dataMartService.deleteDataMart(id);
      dispatch({ type: 'DELETE_DATA_MART_SUCCESS' });
    } catch (error) {
      dispatch({
        type: 'DELETE_DATA_MART_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to delete data mart',
      });
    }
  };

  // Update data mart title
  const updateDataMartTitle = async (id: string, title: string) => {
    try {
      dispatch({ type: 'UPDATE_DATA_MART_TITLE_START' });
      await dataMartService.updateDataMartTitle(id, title);
      dispatch({ type: 'UPDATE_DATA_MART_TITLE_SUCCESS', payload: title });
    } catch (error) {
      dispatch({
        type: 'UPDATE_DATA_MART_TITLE_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to update data mart title',
      });
    }
  };

  // Update data mart description
  const updateDataMartDescription = async (id: string, description: string | null) => {
    try {
      dispatch({ type: 'UPDATE_DATA_MART_DESCRIPTION_START' });
      await dataMartService.updateDataMartDescription(id, description);
      dispatch({ type: 'UPDATE_DATA_MART_DESCRIPTION_SUCCESS', payload: description });
    } catch (error) {
      dispatch({
        type: 'UPDATE_DATA_MART_DESCRIPTION_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to update data mart description',
      });
    }
  };

  // Reset state
  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const value = {
    ...state,
    getDataMart,
    createDataMart,
    updateDataMart,
    deleteDataMart,
    updateDataMartTitle,
    updateDataMartDescription,
    reset,
  };

  return <DataMartContext.Provider value={value}>{children}</DataMartContext.Provider>;
}

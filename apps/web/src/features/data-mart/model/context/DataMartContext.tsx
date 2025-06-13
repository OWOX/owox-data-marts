import { useReducer, type ReactNode, useCallback } from 'react';
import type { CreateDataMartRequestDto, UpdateDataMartRequestDto } from '../../../../shared';
import { dataMartService } from '../../api';
import { DataMartContext } from './context';
import { initialState, reducer } from './reducer';
import { mapDataMartFromDto } from '../mappers';

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
      const dataMart = mapDataMartFromDto(response);
      dispatch({ type: 'CREATE_DATA_MART_SUCCESS', payload: dataMart });
    } catch (error) {
      dispatch({
        type: 'CREATE_DATA_MART_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to create data mart',
      });
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
    reset,
  };

  return <DataMartContext.Provider value={value}>{children}</DataMartContext.Provider>;
}

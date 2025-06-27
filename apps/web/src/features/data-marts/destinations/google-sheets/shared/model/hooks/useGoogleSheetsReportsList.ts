import { useCallback } from 'react';
import { useGoogleSheetsReportsListContext } from '../../model/context';
import { mapGoogleSheetsReportsListFromDto } from '../../../list/model/mappers/google-sheets-reports-list.mapper';
import { googleSheetsService } from '../../../mock/googleSheetsService.mock';
import type { GoogleSheetsReport } from '../../types';

interface UseGoogleSheetsReportsListResult {
  items: GoogleSheetsReport[];
  loading: boolean;
  error: string | null;
  loadGoogleSheets: () => Promise<void>;
  refreshList: () => Promise<void>;
  deleteGoogleSheet: (id: string) => Promise<void>;
  createGoogleSheet: (data: Partial<GoogleSheetsReport>) => Promise<GoogleSheetsReport>;
  updateGoogleSheet: (id: string, data: Partial<GoogleSheetsReport>) => Promise<GoogleSheetsReport>;
}

export function useGoogleSheetsReportsList(): UseGoogleSheetsReportsListResult {
  const { state, dispatch } = useGoogleSheetsReportsListContext();

  const loadGoogleSheets = useCallback(async () => {
    dispatch({ type: 'SET_LOADING' });
    try {
      const response = await googleSheetsService.getGoogleSheets();
      const listItems = mapGoogleSheetsReportsListFromDto(response);
      dispatch({ type: 'SET_ITEMS', payload: listItems });
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to load Google Sheets',
      });
    }
  }, [dispatch]);

  const deleteGoogleSheet = useCallback(
    async (id: string) => {
      dispatch({ type: 'SET_LOADING' });
      try {
        await googleSheetsService.deleteGoogleSheet(id);
      } catch (error) {
        dispatch({
          type: 'SET_ERROR',
          payload: error instanceof Error ? error.message : 'Failed to delete Google Sheet',
        });
        throw error;
      }
    },
    [dispatch]
  );

  const refreshList = useCallback(() => {
    return loadGoogleSheets();
  }, [loadGoogleSheets]);

  const createGoogleSheet = useCallback(
    async (data: Partial<GoogleSheetsReport>) => {
      dispatch({ type: 'SET_LOADING' });
      try {
        const created = await googleSheetsService.createGoogleSheet(data);
        await loadGoogleSheets();
        return created;
      } catch (error) {
        dispatch({
          type: 'SET_ERROR',
          payload: error instanceof Error ? error.message : 'Failed to create Google Sheet',
        });
        throw error;
      }
    },
    [dispatch, loadGoogleSheets]
  );

  const updateGoogleSheet = useCallback(
    async (id: string, data: Partial<GoogleSheetsReport>) => {
      dispatch({ type: 'SET_LOADING' });
      try {
        const updated = await googleSheetsService.updateGoogleSheet(id, data);
        await loadGoogleSheets();
        return updated;
      } catch (error) {
        dispatch({
          type: 'SET_ERROR',
          payload: error instanceof Error ? error.message : 'Failed to update Google Sheet',
        });
        throw error;
      }
    },
    [dispatch, loadGoogleSheets]
  );

  return {
    items: state.items,
    loading: state.loading,
    error: state.error,
    loadGoogleSheets,
    refreshList,
    deleteGoogleSheet,
    createGoogleSheet,
    updateGoogleSheet,
  };
}

export type { UseGoogleSheetsReportsListResult };

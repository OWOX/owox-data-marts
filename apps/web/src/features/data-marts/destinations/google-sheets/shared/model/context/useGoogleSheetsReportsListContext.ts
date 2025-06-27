import { useContext } from 'react';
import { GoogleSheetsReportsListContext } from './GoogleSheetsReportsListContextBase';
import type { GoogleSheetsReportsListContextValue } from '../../model/types';

export function useGoogleSheetsReportsListContext(): GoogleSheetsReportsListContextValue {
  const context = useContext(GoogleSheetsReportsListContext);
  if (context === undefined) {
    throw new Error(
      'useGoogleSheetsReportsListContext must be used within a GoogleSheetsReportsProvider'
    );
  }
  return context;
}

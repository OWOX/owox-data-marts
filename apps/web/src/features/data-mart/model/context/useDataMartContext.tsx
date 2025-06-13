import { useContext } from 'react';
import { DataMartContext } from './context';

/**
 * Custom hook to use the DataMart context
 */
export function useDataMartContext() {
  const context = useContext(DataMartContext);
  if (context === undefined) {
    throw new Error('useDataMartContext must be used within a DataMartProvider');
  }
  return context;
}

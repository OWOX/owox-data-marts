import { useContext } from 'react';
import { DataStorageContext } from './context.ts';

export function useDataStorageContext() {
  const context = useContext(DataStorageContext);
  if (context === undefined) {
    throw new Error('useDataStorageContext must be used within a DataStorageProvider');
  }
  return context;
}

import { useContext } from 'react';
import { DataMartListContext } from './context';
/**
 * Custom hook to access the DataMartList context.
 *
 * This hook must be used within a component that is a child of the DataMartListProvider.
 * It provides the state and dispatch function from the context's reducer.
 *
 * @returns {object} The context value, containing state and dispatch.
 * @throws {Error} If used outside of a DataMartListProvider.
 */
export function useDataMartListContext() {
  const context = useContext(DataMartListContext);

  if (context === undefined) {
    throw new Error('useDataMartListContext must be used within a DataMartListProvider');
  }

  return context;
}

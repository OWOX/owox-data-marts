import React, { useReducer } from 'react';
import { initialDataStorageState, reducer } from './reducer.ts';
import { DataStorageContext } from './context.ts';

interface DataStorageProviderProps {
  children: React.ReactNode;
}

/**
 * Provides a context for data storage management, allowing components
 * to access and modify the shared state using a reducer.
 *
 * @param {Object} props The properties passed to the DataStorageProvider component.
 * @param {React.ReactNode} props.children The child components that will have access to the data storage context.
 * @return {JSX.Element} The provider component that wraps the passed children with the data storage context.
 */
export function DataStorageProvider({ children }: DataStorageProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialDataStorageState);
  return (
    <DataStorageContext.Provider value={{ state, dispatch }}>
      {children}
    </DataStorageContext.Provider>
  );
}

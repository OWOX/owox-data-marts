import React, { useReducer } from 'react';
import { initialDataDestinationState, reducer } from './reducer.ts';
import { DataDestinationContext } from './context.ts';

interface DataDestinationProviderProps {
  children: React.ReactNode;
}

/**
 * Provides a context for data destination management, allowing components
 * to access and modify the shared state using a reducer.
 *
 * @param {Object} props The properties passed to the DataDestinationProvider component.
 * @param {React.ReactNode} props.children The child components that will have access to the data destination context.
 * @return {JSX.Element} The provider component that wraps the passed children with the data destination context.
 */
export function DataDestinationProvider({ children }: DataDestinationProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialDataDestinationState);
  return (
    <DataDestinationContext.Provider value={{ state, dispatch }}>
      {children}
    </DataDestinationContext.Provider>
  );
}

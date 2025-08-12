import { type ReactNode, useReducer } from 'react';
import { initialConnectorState, reducer } from './reducer';
import { ConnectorContext } from './context';

interface ConnectorContextProviderProps {
  children: ReactNode;
}

export function ConnectorContextProvider({ children }: ConnectorContextProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialConnectorState);
  return (
    <ConnectorContext.Provider value={{ state, dispatch }}>{children}</ConnectorContext.Provider>
  );
}

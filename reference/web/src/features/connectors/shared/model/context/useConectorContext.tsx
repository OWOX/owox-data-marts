import { useContext } from 'react';
import { ConnectorContext } from './context';

export function useConnectorContext() {
  const context = useContext(ConnectorContext);
  if (!context) {
    throw new Error('useConnectorContext must be used within a ConnectorContextProvider');
  }
  return context;
}

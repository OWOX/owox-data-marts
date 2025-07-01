import { useContext } from 'react';
import { DataDestinationContext } from './context.ts';

export function useDataDestinationContext() {
  const context = useContext(DataDestinationContext);
  if (context === undefined) {
    throw new Error('useDataDestinationContext must be used within a DataDestinationProvider');
  }
  return context;
}

import { useContext } from 'react';
import { BuilderContext } from './context';

export function useBuilderContext() {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error('useBuilderContext must be used within a BuilderProvider');
  return ctx;
}

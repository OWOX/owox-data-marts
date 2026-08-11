import { type ReactNode, useReducer } from 'react';
import { builderReducer, initialBuilderState } from './reducer';
import { BuilderContext } from './context';

export function BuilderProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(builderReducer, initialBuilderState);
  return <BuilderContext.Provider value={{ state, dispatch }}>{children}</BuilderContext.Provider>;
}

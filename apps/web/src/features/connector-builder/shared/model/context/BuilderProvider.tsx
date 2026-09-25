import { type ReactNode, useMemo, useReducer, useRef } from 'react';
import type { BuilderManifest } from '../manifest.types';
import { builderReducer, initialBuilderState } from './reducer';
import { BuilderContext } from './context';

export function BuilderProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(builderReducer, initialBuilderState);
  const codeEdits = useRef<(() => BuilderManifest | null) | null>(null);
  // A fresh object here is a context change as far as React is concerned, so every consumer
  // in the builder would re-render for provider renders that carry no new state at all.
  // `dispatch` and `codeEdits` are stable, so the identity tracks the state exactly.
  const value = useMemo(() => ({ state, dispatch, codeEdits }), [state]);
  return <BuilderContext.Provider value={value}>{children}</BuilderContext.Provider>;
}

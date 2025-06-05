import { useReducer, type PropsWithChildren } from 'react';
import { initialState, reducer } from './reducer';
import { DataMartListContext } from './context.ts';

export function DataMartListProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, initialState);

  return (
    <DataMartListContext.Provider value={{ state, dispatch }}>
      {children}
    </DataMartListContext.Provider>
  );
}

import { useReducer, type PropsWithChildren } from 'react';
import { GoogleSheetsReportsListContext } from './GoogleSheetsReportsListContextBase';
import { initialState, reducer } from '../../model/reducer';

export { GoogleSheetsReportsListContext };

export function GoogleSheetsReportsProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <GoogleSheetsReportsListContext.Provider value={{ state, dispatch }}>
      {children}
    </GoogleSheetsReportsListContext.Provider>
  );
}

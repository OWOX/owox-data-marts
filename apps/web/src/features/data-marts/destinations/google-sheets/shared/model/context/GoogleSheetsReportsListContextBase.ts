import { createContext } from 'react';
import type { GoogleSheetsReportsListContextValue } from '../../model/types';

export const GoogleSheetsReportsListContext = createContext<
  GoogleSheetsReportsListContextValue | undefined
>(undefined);

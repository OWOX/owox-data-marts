import { createContext } from 'react';
import type { ConnectorContextValue } from './types';

export const ConnectorContext = createContext<ConnectorContextValue | undefined>(undefined);

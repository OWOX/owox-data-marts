import { createContext } from 'react';
import type { BuilderContextValue } from './types';

export const BuilderContext = createContext<BuilderContextValue | undefined>(undefined);

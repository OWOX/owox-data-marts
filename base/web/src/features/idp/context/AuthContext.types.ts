import { createContext } from 'react';
import type { AuthState, AuthActions } from '../types';

/**
 * Auth context type combining state and actions
 */
export type AuthContextType = AuthState & AuthActions;

/**
 * Auth context
 */
export const AuthContext = createContext<AuthContextType | null>(null);

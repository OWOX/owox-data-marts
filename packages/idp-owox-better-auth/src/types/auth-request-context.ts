import { type Request } from 'express';
import {
  extractAuthFlowParams,
  extractRefreshToken,
  getStateManager,
  type AuthFlowParams,
} from '../utils/request-utils.js';

/**
 * Extracted request context used for auth flow decisions.
 */
export interface AuthRequestContext {
  state?: string;
  authFlowParams: AuthFlowParams;
  refreshToken?: string;
}

/**
 * Builds auth request context from query and cookies.
 */
export function buildAuthRequestContext(req: Request): AuthRequestContext {
  const stateManager = getStateManager(req);
  return {
    state: stateManager.extract() || undefined,
    authFlowParams: extractAuthFlowParams(req),
    refreshToken: extractRefreshToken(req),
  };
}

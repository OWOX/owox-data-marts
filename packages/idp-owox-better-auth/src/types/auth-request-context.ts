import { type Request } from 'express';
import {
  extractPlatformParams,
  extractRefreshToken,
  getStateManager,
  type PlatformParams,
} from '../utils/request-utils.js';

/**
 * Extracted request context used for auth flow decisions.
 */
export interface AuthRequestContext {
  state?: string;
  platformParams: PlatformParams;
  refreshToken?: string;
}

/**
 * Builds auth request context from query and cookies.
 */
export function buildAuthRequestContext(req: Request): AuthRequestContext {
  const stateManager = getStateManager(req);
  return {
    state: stateManager.extract() || undefined,
    platformParams: extractPlatformParams(req),
    refreshToken: extractRefreshToken(req),
  };
}

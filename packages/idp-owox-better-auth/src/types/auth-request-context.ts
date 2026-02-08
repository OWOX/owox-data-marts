import { type Request } from 'express';
import {
  extractPlatformParams,
  extractRefreshToken,
  extractState,
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
  return {
    state: extractState(req) || undefined,
    platformParams: extractPlatformParams(req),
    refreshToken: extractRefreshToken(req),
  };
}

import { type Request } from 'express';
import {
  extractPlatformParams,
  extractRefreshToken,
  extractState,
  type PlatformParams,
} from '../utils/request-utils.js';

export interface AuthRequestContext {
  state?: string;
  platformParams: PlatformParams;
  refreshToken?: string;
}

export function buildAuthRequestContext(req: Request): AuthRequestContext {
  return {
    state: extractState(req) || undefined,
    platformParams: extractPlatformParams(req),
    refreshToken: extractRefreshToken(req),
  };
}

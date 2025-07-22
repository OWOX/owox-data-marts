import { IKeyStorage } from './interfaces.js';
import { Algorithm } from './enums.js';

export interface IdpConfig {
  // JWT Configuration
  issuer?: string;
  audience?: string;
  accessTokenTTL?: number; // in seconds, default 15 minutes
  refreshTokenTTL?: number; // in seconds, default 7 days

  // Key management
  algorithm?: Algorithm;
  keyStorage?: IKeyStorage;

  // Magic link configuration
  magicLinkTTL?: number; // in seconds, default 1 hour
  magicLinkBaseUrl?: string;

  // Project configuration
  defaultProjectId?: string;
  requireEmailVerification?: boolean;

  // Database configuration (optional)
  databaseUrl?: string;
}

export interface IdpConfig {
  // Magic link configuration
  magicLinkTTL?: number; // in seconds, default 1 hour
  magicLinkBaseUrl?: string;

  // Project configuration
  defaultProjectId?: string;
  requireEmailVerification?: boolean;

  // IDP-specific configuration can be added by implementations
  [key: string]: any;
}

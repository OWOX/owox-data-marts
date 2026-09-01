export { CredentialsManager } from './CredentialsManager';
export { CredentialConfigSheet } from './components/CredentialConfigSheet';
export type { CredentialConfigSheetProps } from './components/CredentialConfigSheet';
export { credentialsService } from './credentials.service';
export { useCredentials, useCredentialDefinitions } from './useCredentials';
export type { Credential, CredentialDefinition, PluginCredentialRequirement } from './types';
export { isCredentialEligible, normalizePluginCredentialRequirement } from './types';

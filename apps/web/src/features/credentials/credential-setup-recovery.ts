import { createContext } from 'react';

/** Records only the saved ID for the original setup, without completing it or changing the session. */
export const CredentialSetupRecoveryContext = createContext<
  ((credentialId: string, interrupted: boolean) => void) | null
>(null);

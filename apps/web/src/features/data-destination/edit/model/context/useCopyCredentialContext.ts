import { useContext } from 'react';
import { CopyCredentialContext } from './copy-credential-context';

export function useCopyCredentialContext() {
  const ctx = useContext(CopyCredentialContext);
  if (!ctx) {
    throw new Error(
      'useCopyCredentialContext must be used within a CopyCredentialContext.Provider'
    );
  }
  return ctx;
}

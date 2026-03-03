import { createContext } from 'react';
import type { CredentialIdentity } from '../../../../../shared/types/credential-identity';

export interface CopyCredentialContextValue {
  entityId?: string;
  onSourceSelect: (
    sourceId: string,
    title: string,
    identity: CredentialIdentity | null
  ) => void;
  selectedSource: { id: string; title: string; identity: CredentialIdentity | null } | null;
  onSourceClear: () => void;
}

export const CopyCredentialContext = createContext<CopyCredentialContextValue | null>(null);

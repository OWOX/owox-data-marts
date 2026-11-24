import { createContext, useContext } from 'react';

interface CloudProjectCreation {
  canCreate: boolean;
  creating: boolean;
  hasCreatedProject: boolean;
  label: string;
  createProject: () => Promise<void>;
}

export const CloudProjectCreationContext = createContext<CloudProjectCreation | null>(null);

export function useCloudProjectCreation() {
  const creation = useContext(CloudProjectCreationContext);
  if (!creation)
    throw new Error('useCloudProjectCreation must be used within CloudProjectCreationProvider');

  return creation;
}

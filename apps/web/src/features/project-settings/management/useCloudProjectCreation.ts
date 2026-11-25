import { createContext, useContext } from 'react';
import type { ProjectsActions } from '../../idp/context/ProjectContext.types';

interface CloudProjectCreation {
  canCreate: boolean;
  creating: boolean;
  hasCreatedProject: boolean;
  label: string;
  createProject: () => Promise<void>;
  registerProjectListLoader: (loadProjects: ProjectsActions['loadProjects']) => () => void;
}

export const CloudProjectCreationContext = createContext<CloudProjectCreation | null>(null);

export function useCloudProjectCreation() {
  const creation = useContext(CloudProjectCreationContext);
  if (!creation)
    throw new Error('useCloudProjectCreation must be used within CloudProjectCreationProvider');

  return creation;
}

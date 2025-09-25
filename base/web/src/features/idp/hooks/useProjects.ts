import { createContext, useContext } from 'react';
import type { ProjectsContextType } from '../context/ProjectContext.types.ts';

export const ProjectsContext = createContext<ProjectsContextType | null>(null);
export function useProjects(): ProjectsContextType {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error('useProjects must be used within a ProjectsProvider');
  return ctx;
}

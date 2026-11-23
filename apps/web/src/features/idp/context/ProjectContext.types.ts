import type { Projects } from '../types';
import { RequestStatus } from '../../../shared/types/request-status.ts';
import type { ApiError } from '../../../app/api';

export interface ProjectsState {
  projects: Projects;
  callState: RequestStatus;
  error: ApiError | null;
}

export interface ProjectsActions {
  loadProjects: (options?: { force?: boolean }) => Promise<void>;
  reset: () => void;
}

export type ProjectsContextType = ProjectsState & ProjectsActions & { isLoading: boolean };

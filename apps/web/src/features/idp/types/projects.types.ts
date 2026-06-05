export type ProjectStatus = 'active' | 'blocked' | 'removed';

export interface Project {
  id: string;
  title: string;
  status?: ProjectStatus;
}

export type Projects = Project[];

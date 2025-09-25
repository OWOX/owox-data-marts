import { useAppSelector } from '../core/store-hooks';
import type { ProjectState } from '../reducers/project.reducer';

export function useProject() {
  return useAppSelector(state => (state as { project: ProjectState }).project);
}

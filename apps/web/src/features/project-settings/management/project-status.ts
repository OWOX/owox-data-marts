import type { Project } from '../../idp/types';
import { StatusTypeEnum } from '../../../shared/components/StatusLabel';

export const projectStatusLabels = {
  active: { label: 'Active', type: StatusTypeEnum.SUCCESS },
  blocked: { label: 'Blocked', type: StatusTypeEnum.ERROR },
  removed: { label: 'Removed', type: StatusTypeEnum.NEUTRAL },
  removing: { label: 'Removing', type: StatusTypeEnum.WARNING },
};

export function getProjectStatus(project?: Project) {
  if (project?.status === 'removed') return 'removed';
  return project?.removalPending ? 'removing' : project?.status;
}

import { RunType } from '../../../common/scheduler/shared/types';

export interface RunReportCommand {
  reportId: string;
  userId: string;
  roles?: string[];
  runType: RunType;
  projectId?: string;
}

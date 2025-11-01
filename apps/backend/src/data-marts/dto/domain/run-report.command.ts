import { RunType } from '../../../common/scheduler/shared/types';

export interface RunReportCommand {
  reportId: string;
  userId: string;
  runType: RunType;
}

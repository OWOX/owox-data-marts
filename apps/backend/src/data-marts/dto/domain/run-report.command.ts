import { RunType } from 'src/common/scheduler/shared/types';

export interface RunReportCommand {
  reportId: string;
  userId: string;
  runType: RunType;
}

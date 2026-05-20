import { RunType } from '../../../common/scheduler/shared/types';

interface BaseRunReportCommand {
  reportId: string;
  userId: string;
}

export interface ManualRunReportCommand extends BaseRunReportCommand {
  runType: RunType.manual;
  roles: string[];
  projectId: string;
}

export interface ScheduledRunReportCommand extends BaseRunReportCommand {
  runType: RunType.scheduled;
  projectId: string;
}

export type RunReportCommand = ManualRunReportCommand | ScheduledRunReportCommand;

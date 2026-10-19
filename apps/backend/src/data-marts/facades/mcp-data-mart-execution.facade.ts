import type { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import type { DataMartRunType } from '../enums/data-mart-run-type.enum';
import type { RunType } from '../../common/scheduler/shared/types';

export { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
export { DataMartRunType } from '../enums/data-mart-run-type.enum';
export { RunType } from '../../common/scheduler/shared/types';
export const MCP_DATA_MART_EXECUTION_FACADE = Symbol('MCP_DATA_MART_EXECUTION_FACADE');
export interface DataMartExecutionActor {
  projectId: string;
  userId: string;
  roles: string[];
}
export interface DataMartExecutionRequest extends DataMartExecutionActor {
  dataMartId: string;
}
export interface DataMartExecutionRunRequest extends DataMartExecutionRequest {
  runId: string;
}
export interface DataMartExecutionRunDto {
  id: string;
  dataMartId: string;
  type: DataMartRunType;
  status: DataMartRunStatus;
  runType: RunType;
  configurationRevision: number | null;
  currentConfigurationRevision: number;
  configurationCurrent: boolean | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  diagnostics: { logsAvailable: boolean; errorsAvailable: boolean; content: 'withheld' };
  load: {
    runType: 'INCREMENTAL' | 'MANUAL_BACKFILL' | null;
    dateRange: { startDate: string; endDate: string } | null;
  } | null;
  backfillChain: {
    id: string;
    requestedStart: string;
    requestedEnd: string;
    segmentIndex: number;
    segmentsTotal: number;
    segmentDays?: number;
  } | null;
}
export interface DataMartLoadScheduleDto {
  id: string;
  cronExpression: string;
  timeZone: string;
  enabled: boolean;
  nextRunAt: string | null;
  revision: number;
  loadParameters: { mode: 'connector-default'; configurable: false };
  recurringEffect: string;
}
export interface DataMartLoadSchedulesDto {
  dataMartId: string;
  revision: number;
  revisionAggregate: 'data-mart-configuration';
  schedules: DataMartLoadScheduleDto[];
}
export interface DataMartExecutionCancellationDto {
  dataMartId: string;
  requestedRunId: string;
  scope: 'run' | 'backfill-chain';
  outcome: 'cancelled' | 'already-cancelled';
  rollback: false;
}
export interface DataMartRunLoadRequest extends DataMartExecutionRequest {
  expectedRevision: number;
  operationId: string;
  load?:
    | { runType: 'INCREMENTAL' }
    | {
        runType: 'MANUAL_BACKFILL';
        startDate: string;
        endDate?: string;
      };
}
export interface DataMartSaveScheduleRequest extends DataMartExecutionRequest {
  expectedRevision: number;
  scheduleId?: string;
  operationId?: string;
  cronExpression: string;
  timeZone: string;
  enabled: boolean;
}
export interface DataMartDeleteScheduleRequest extends DataMartExecutionRequest {
  expectedRevision: number;
  scheduleId: string;
  operationId: string;
}
export interface DataMartExecutionMutationDto {
  dataMartId: string;
  resourceId: string;
  revision: number;
  revisionAggregate: 'data-mart-configuration';
  outcome: 'completed' | 'incomplete' | 'unknown';
  runId?: string;
  triggerId?: string;
  deleted?: boolean;
  effect: string;
}
export interface McpDataMartExecutionFacade {
  runDataMart(request: DataMartRunLoadRequest): Promise<DataMartExecutionMutationDto>;
  saveSchedule(request: DataMartSaveScheduleRequest): Promise<DataMartExecutionMutationDto>;
  deleteSchedule(request: DataMartDeleteScheduleRequest): Promise<DataMartExecutionMutationDto>;
  getRun(request: DataMartExecutionRunRequest): Promise<DataMartExecutionRunDto>;
  listSchedules(request: DataMartExecutionRequest): Promise<DataMartLoadSchedulesDto>;
  cancelRun(request: DataMartExecutionRunRequest): Promise<DataMartExecutionCancellationDto>;
}

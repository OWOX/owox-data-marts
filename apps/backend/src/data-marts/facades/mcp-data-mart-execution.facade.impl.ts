import { Injectable } from '@nestjs/common';
import { DataMartExecutionService } from '../use-cases/data-mart-execution.service';
import type {
  DataMartExecutionRequest,
  DataMartRunLoadRequest,
  DataMartSaveScheduleRequest,
  DataMartDeleteScheduleRequest,
  DataMartExecutionRunRequest,
  McpDataMartExecutionFacade,
} from './mcp-data-mart-execution.facade';

@Injectable()
export class McpDataMartExecutionFacadeImpl implements McpDataMartExecutionFacade {
  constructor(private readonly execution: DataMartExecutionService) {}
  runDataMart(request: DataMartRunLoadRequest) {
    return this.execution.runDataMart(request);
  }
  saveSchedule(request: DataMartSaveScheduleRequest) {
    return this.execution.saveSchedule(request);
  }
  deleteSchedule(request: DataMartDeleteScheduleRequest) {
    return this.execution.deleteSchedule(request);
  }
  getRun(request: DataMartExecutionRunRequest) {
    return this.execution.getRun(request);
  }
  listSchedules(request: DataMartExecutionRequest) {
    return this.execution.listSchedules(request);
  }
  cancelRun(request: DataMartExecutionRunRequest) {
    return this.execution.cancelRun(request);
  }
}

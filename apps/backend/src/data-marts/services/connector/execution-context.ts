import { DataMart } from '../../entities/data-mart.entity';
import { DataMartRun } from '../../entities/data-mart-run.entity';

/**
 * Execution context holding information about the current connector run
 * Provides consistent context for logging and error reporting
 */
export class ExecutionContext {
  readonly dataMartId: string;
  readonly projectId: string;
  readonly runId: string;
  readonly runType: string;
  readonly processId: string;

  private constructor(
    dataMartId: string,
    projectId: string,
    runId: string,
    runType: string,
    processId: string
  ) {
    this.dataMartId = dataMartId;
    this.projectId = projectId;
    this.runId = runId;
    this.runType = runType;
    this.processId = processId;
  }

  /**
   * Create execution context from DataMart and Run
   */
  static fromRun(dataMart: DataMart, run: DataMartRun): ExecutionContext {
    const processId = `connector-run-${run.id}`;
    return new ExecutionContext(
      dataMart.id,
      dataMart.projectId,
      run.id,
      run.runType || 'UNKNOWN',
      processId
    );
  }

  /**
   * Get base context object for logging
   */
  toLogContext(): Record<string, unknown> {
    return {
      dataMartId: this.dataMartId,
      projectId: this.projectId,
      runId: this.runId,
      runType: this.runType,
    };
  }

  /**
   * Get context with additional fields
   */
  withFields(additionalFields: Record<string, unknown>): Record<string, unknown> {
    return {
      ...this.toLogContext(),
      ...additionalFields,
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';

import {
  Agent,
  ErrorPolicy,
  QueryRow,
  SharedAgentContext,
  SqlErrorKind,
  SqlStepError,
} from '../ai-insights-types';
import {
  QueryRepairAction,
  QueryRepairAttempt,
  QueryRepairResponse,
  SqlAgentInput,
  SqlAgentResult,
  SqlErrorAdvisorResponse,
  SqlExecutionStatus,
} from './types';
import { SqlBuilderAgent } from './sql-builder.agent';
import { SqlDryRunService } from '../../use-cases/sql-dry-run.service';
import { SqlRunService } from '../../use-cases/sql-run.service';
import { SqlDryRunCommand } from '../../dto/domain/sql-dry-run.command';
import { ErrorTracker } from '../error.tracker';
import { SqlErrorAdvisorAgent } from './sql-error-advisor.agent';
import { QueryRepairAgent } from './query-repair.agent';
import { castError } from '@owox/internal-helpers';

@Injectable()
export class SqlAgent implements Agent<SqlAgentInput, SqlAgentResult> {
  readonly name = 'SqlAgent';
  private readonly logger = new Logger(SqlAgent.name);

  constructor(
    private readonly sqlDryRunService: SqlDryRunService,
    private readonly sqlRunService: SqlRunService,
    private readonly sqlBuilderAgent: SqlBuilderAgent,
    private readonly queryRepairAgent: QueryRepairAgent,
    private readonly sqlErrorAdvisorAgent: SqlErrorAdvisorAgent
  ) {}

  async run(input: SqlAgentInput, shared: SharedAgentContext): Promise<SqlAgentResult> {
    const policy: ErrorPolicy = { maxErrorsTotal: 4, stopOnRepeatedSameError: true };
    const tracker = new ErrorTracker(policy);

    const attempts: QueryRepairAttempt[] = [];

    let sql = (await this.sqlBuilderAgent.run(input, shared)).sql;

    while (true) {
      const validation = await this.validateSql(shared, sql);

      if (validation.ok) {
        const queryExecution = await this.executeSql(shared, sql);

        if (queryExecution.ok) {
          return this.okResult(queryExecution.rows, sql, validation.bytes);
        }

        const stepError: SqlStepError = {
          kind: SqlErrorKind.EXECUTE_ERROR,
          message: queryExecution.error.message,
          bytes: validation.bytes,
        };

        this.pushAttempt(attempts, { sql, error: stepError });

        if (!tracker.canContinue()) {
          return this.failResultWithAdvisor(shared, input, sql, stepError);
        }

        const repeatRecord = tracker.record(stepError.message);
        if (tracker.shouldStopBecauseRepeated(repeatRecord.repeated)) {
          return this.failResultWithAdvisor(shared, input, sql, stepError);
        }

        const repairResponse: QueryRepairResponse = await this.queryRepairAgent.run(
          {
            prompt: input.prompt,
            queryPlan: input.plan,
            schema: input.rawSchema,
            attempts: this.getAttemptsForRepair(attempts, 4),
          },
          shared
        );

        if (repairResponse.action === QueryRepairAction.CANNOT_REPAIR) {
          this.logger.warn(`Query cannot repair: ${repairResponse.notes}`);
          return this.failResultWithAdvisor(shared, input, sql, stepError);
        }

        sql = repairResponse.sql;
        continue;
      }

      const err = validation.error;

      this.pushAttempt(attempts, { sql, error: err });

      if (!tracker.canContinue()) {
        return this.failResultWithAdvisor(shared, input, sql, err);
      }

      const rec = tracker.record(err.message);
      if (tracker.shouldStopBecauseRepeated(rec.repeated)) {
        return this.failResultWithAdvisor(shared, input, sql, err);
      }

      const repairResponse: QueryRepairResponse = await this.queryRepairAgent.run(
        {
          prompt: input.prompt,
          queryPlan: input.plan,
          schema: input.rawSchema,
          attempts: this.getAttemptsForRepair(attempts, 4),
        },
        shared
      );

      if (repairResponse.action === QueryRepairAction.CANNOT_REPAIR) {
        this.logger.warn(`Query cannot repair: ${repairResponse.notes}`);
        return this.failResultWithAdvisor(shared, input, sql, err);
      }

      sql = repairResponse.sql;
    }
  }

  private async validateSql(
    shared: SharedAgentContext,
    sql: string
  ): Promise<{ ok: true; bytes?: number } | { ok: false; error: SqlStepError }> {
    const { projectId, dataMartId, budgets } = shared;

    const dry = await this.sqlDryRunService.run(new SqlDryRunCommand(dataMartId, projectId, sql));
    const overBudget =
      budgets.maxBytesProcessed != null &&
      dry.bytes != null &&
      dry.bytes > budgets.maxBytesProcessed;

    if (!dry.isValid) {
      return {
        ok: false,
        error: {
          kind: SqlErrorKind.DRY_RUN_ERROR,
          message: dry.error ?? 'Dry-run failed',
          bytes: dry.bytes,
        },
      };
    }

    if (overBudget) {
      return {
        ok: false,
        error: {
          kind: SqlErrorKind.OVER_BUDGET,
          message: `Estimated bytes ${dry.bytes} exceed budget ${budgets.maxBytesProcessed}`,
          bytes: dry.bytes,
        },
      };
    }

    return { ok: true, bytes: dry.bytes };
  }

  private async executeSql(
    shared: SharedAgentContext,
    sql: string
  ): Promise<{ ok: true; rows: QueryRow[] } | { ok: false; error: Error }> {
    const { projectId, dataMartId, budgets } = shared;

    try {
      const rows: QueryRow[] = [];
      for await (const row of this.sqlRunService.runRows<QueryRow>({
        dataMartId,
        projectId,
        sql,
        limit: budgets.maxRows ?? 30,
      })) {
        rows.push(row);
      }
      return { ok: true, rows };
    } catch (e) {
      return { ok: false, error: castError(e) };
    }
  }

  private okResult(rows: QueryRow[], sql: string, bytes?: number): SqlAgentResult {
    return {
      status: rows.length > 0 ? SqlExecutionStatus.OK : SqlExecutionStatus.NO_DATA,
      sql,
      dryRunBytes: bytes,
      rows,
      sqlError: null,
      sqlErrorSuggestion: null,
    };
  }

  private async failResultWithAdvisor(
    shared: SharedAgentContext,
    input: SqlAgentInput,
    sql: string,
    error: SqlStepError
  ): Promise<SqlAgentResult> {
    const advice: SqlErrorAdvisorResponse = await this.sqlErrorAdvisorAgent.run(
      {
        prompt: input.prompt,
        sql,
        sqlStepError: error,
        queryPlan: input.plan,
        schema: input.rawSchema,
      },
      shared
    );

    return {
      status: SqlExecutionStatus.SQL_ERROR,
      sql,
      dryRunBytes: error.bytes,
      rows: null,
      sqlError: advice.sqlError,
      sqlErrorSuggestion: advice.sqlErrorSuggestion,
    };
  }

  private pushAttempt(attempts: QueryRepairAttempt[], attempt: QueryRepairAttempt): void {
    attempts.push(attempt);
  }

  private getAttemptsForRepair(attempts: QueryRepairAttempt[], max: number): QueryRepairAttempt[] {
    return attempts.slice(Math.max(0, attempts.length - max));
  }
}

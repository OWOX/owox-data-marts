import { Injectable } from '@nestjs/common';
import { SqlRunExecutorFacade } from '../data-storage-types/facades/sql-run-executor.facade';
import { SqlRunCommand } from '../dto/domain/sql-run.command';
import { DataMartService } from '../services/data-mart.service';
import { SqlRunBatch } from '../dto/domain/sql-run-batch.dto';

@Injectable()
export class SqlRunService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly sqlRunExecutorFacade: SqlRunExecutorFacade
  ) {}

  /**
   * Executes SQL against the Data Mart storage and returns an async generator of batches.
   * This avoids keeping the full dataset in memory.
   */
  async *runBatches<Row = Record<string, unknown>>(
    command: SqlRunCommand
  ): AsyncGenerator<SqlRunBatch<Row>> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(
      command.dataMartId,
      command.projectId
    );

    const storage = dataMart.storage;
    if (!storage?.type || !storage.credentials || !storage.config || !dataMart.definition) {
      throw new Error('Storage setup is not finished.');
    }

    yield* this.sqlRunExecutorFacade.executeBatches<Row>(
      storage.type,
      storage.credentials,
      storage.config,
      dataMart.definition,
      command.sql,
      { maxRowsPerBatch: command.maxRowsPerBatch }
    );
  }

  async *runRows<Row = Record<string, unknown>>(
    command: SqlRunCommand & { limit?: number }
  ): AsyncGenerator<Row> {
    let produced = 0;
    for await (const batch of this.runBatches<Row>(command)) {
      for (const row of batch.rows) {
        yield row;
        if (command.limit != null && ++produced >= command.limit) return;
      }
    }
  }
}

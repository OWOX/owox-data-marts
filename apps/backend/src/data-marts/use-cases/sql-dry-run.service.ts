import { Injectable } from '@nestjs/common';
import { SqlDryRunExecutorFacade } from '../data-storage-types/facades/sql-dry-run-executor.facade';
import { SqlDryRunResult } from '../dto/domain/sql-dry-run-result.dto';
import { SqlDryRunCommand } from '../dto/domain/sql-dry-run.command';
import { DataMartService } from '../services/data-mart.service';

@Injectable()
export class SqlDryRunService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly sqlDryRunExecutorFacade: SqlDryRunExecutorFacade
  ) {}

  async run(command: SqlDryRunCommand): Promise<SqlDryRunResult> {
    const dataMart = await this.dataMartService.getByIdAndProjectIdAndUserId(
      command.dataMartId,
      command.projectId,
      command.userId
    );

    const storage = dataMart.storage;
    if (!storage || !storage.type || !storage.credentials || !storage.config) {
      return SqlDryRunResult.failed('Data Source setup is not finished…');
    }

    return this.sqlDryRunExecutorFacade.execute(
      dataMart.storage.type,
      dataMart.storage.credentials!,
      dataMart.storage.config!,
      command.sql
    );
  }
}

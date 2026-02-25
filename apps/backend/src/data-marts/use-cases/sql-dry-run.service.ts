import { Injectable } from '@nestjs/common';
import { SqlDryRunExecutorFacade } from '../data-storage-types/facades/sql-dry-run-executor.facade';
import { SqlDryRunResult } from '../dto/domain/sql-dry-run-result.dto';
import { SqlDryRunCommand } from '../dto/domain/sql-dry-run.command';
import { DataMartService } from '../services/data-mart.service';
import { DataMartSqlTableService } from '../services/data-mart-sql-table.service';
import { DataStorageCredentialsResolver } from '../data-storage-types/data-storage-credentials-resolver.service';

@Injectable()
export class SqlDryRunService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly sqlDryRunExecutorFacade: SqlDryRunExecutorFacade,
    private readonly dataMartSqlTableService: DataMartSqlTableService
    private readonly credentialsResolver: DataStorageCredentialsResolver
  ) {}

  async run(command: SqlDryRunCommand): Promise<SqlDryRunResult> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(
      command.dataMartId,
      command.projectId
    );

    const storage = dataMart.storage;
    if (!storage || !storage.type || !storage.config) {
      return SqlDryRunResult.failed('Storage setup is not finished…');
    }
    if (!storage.credentialId) {
      return SqlDryRunResult.failed('Storage setup is not finished…');
    }

    const credentials = await this.credentialsResolver.resolve(storage);

    const sql = await this.dataMartSqlTableService.resolveDataMartTableMacro(dataMart, command.sql);

    return this.sqlDryRunExecutorFacade.execute(
      storage.type,
      credentials,
      storage.config,
      sql
    );
  }
}

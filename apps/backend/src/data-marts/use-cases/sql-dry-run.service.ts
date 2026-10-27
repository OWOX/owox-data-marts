import { Injectable, ForbiddenException } from '@nestjs/common';
import { SqlDryRunExecutorFacade } from '../data-storage-types/facades/sql-dry-run-executor.facade';
import { SqlDryRunResult } from '../dto/domain/sql-dry-run-result.dto';
import { SqlDryRunCommand } from '../dto/domain/sql-dry-run.command';
import { DataMartService } from '../services/data-mart.service';
import { DataMartSqlTableService } from '../services/data-mart-sql-table.service';
import { DataStorageCredentialsResolver } from '../data-storage-types/data-storage-credentials-resolver.service';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import { DataMartSqlReferenceResolver } from '../services/data-mart-sql-reference-resolver.service';
import { DataMartSqlReferenceValidator } from '../services/data-mart-sql-reference-validator.service';
import { isSqlDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { isDataMartSqlReferenceException } from '../sql-references/data-mart-sql-reference.errors';

@Injectable()
export class SqlDryRunService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly sqlDryRunExecutorFacade: SqlDryRunExecutorFacade,
    private readonly dataMartSqlTableService: DataMartSqlTableService,
    private readonly credentialsResolver: DataStorageCredentialsResolver,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly sqlReferenceValidator: DataMartSqlReferenceValidator,
    private readonly sqlReferenceResolver: DataMartSqlReferenceResolver
  ) {}

  async run(command: SqlDryRunCommand): Promise<SqlDryRunResult> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(
      command.dataMartId,
      command.projectId
    );

    if (command.userId) {
      const canEdit = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        command.dataMartId,
        Action.EDIT,
        command.projectId
      );
      if (!canEdit) {
        throw new ForbiddenException('You do not have permission to edit this DataMart');
      }
    }

    const storage = dataMart.storage;
    if (!storage || !storage.type || !storage.config) {
      return SqlDryRunResult.failed('Storage setup is not finished…');
    }
    if (!storage.credentialId) {
      return SqlDryRunResult.failed('Storage setup is not finished…');
    }

    const credentials = await this.credentialsResolver.resolve(storage);

    const withMacro = await this.dataMartSqlTableService.resolveDataMartTableMacro(
      dataMart,
      command.sql
    );

    // The editor dry-runs SQL that is not saved yet, so its Data Mart references are checked the
    // way saving would check them, and the reported result is for the resolved query.
    let sql: string;
    try {
      await this.sqlReferenceValidator.prepareForSave({
        dataMart,
        sqlQuery: withMacro,
        previousSqlQuery:
          dataMart.definition && isSqlDefinition(dataMart.definition)
            ? dataMart.definition.sqlQuery
            : undefined,
        userId: command.userId || undefined,
        roles: command.roles,
      });
      sql = await this.sqlReferenceResolver.expandSql(withMacro, {
        projectId: dataMart.projectId,
        storage,
        dataMartId: dataMart.id,
      });
    } catch (error) {
      if (isDataMartSqlReferenceException(error)) {
        return SqlDryRunResult.failed(error.message);
      }
      throw error;
    }

    return this.sqlDryRunExecutorFacade.execute(storage.type, credentials, storage.config, sql);
  }
}

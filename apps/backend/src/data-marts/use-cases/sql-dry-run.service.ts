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
import {
  DataMartSqlReferenceErrorCode,
  DataMartSqlReferenceException,
  isDataMartSqlReferenceException,
} from '../sql-references/data-mart-sql-reference.errors';
import {
  parseDataMartReferences,
  sqlLexingOptionsFor,
} from '../sql-references/data-mart-sql-reference';
import { DataMart } from '../entities/data-mart.entity';

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
    if (!(await this.credentialsResolver.hasCredentials(storage))) {
      return SqlDryRunResult.failed('Storage setup is not finished…');
    }

    const credentials = await this.credentialsResolver.resolve(storage);

    const withMacro = await this.dataMartSqlTableService.resolveDataMartTableMacro(
      dataMart,
      command.sql
    );

    // The editor dry-runs SQL that is not saved yet, so its Data Mart references are checked the
    // way saving would check them, and the reported result is for the resolved query. The
    // warehouse's answer describes the referenced Data Marts (their columns in an error, the bytes
    // they scan), so a reference whose access nobody checked must not reach it.
    let sql: string;
    try {
      await this.sqlReferenceValidator.prepareForSave({
        dataMart,
        sqlQuery: withMacro,
        userId: command.userId || undefined,
        roles: command.roles,
      });
      if (!command.userId && !command.referenceAccessChecked) {
        this.refuseReferencesNotSaved(dataMart, withMacro);
      }
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

  /**
   * Checks the Data Mart references in SQL the editor asks to dry-run, as the user who asks. The
   * dry run itself runs later, from a trigger that keeps no roles, so this is where the user's
   * access to the referenced Data Marts is checked. Throws the error saving the SQL would give.
   */
  async checkReferences(command: SqlDryRunCommand): Promise<void> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(
      command.dataMartId,
      command.projectId
    );
    // Without a storage the dry run reports the unfinished setup instead.
    if (!dataMart.storage?.type) return;

    const sqlQuery = await this.dataMartSqlTableService.resolveDataMartTableMacro(
      dataMart,
      command.sql
    );
    await this.sqlReferenceValidator.prepareForSave({
      dataMart,
      sqlQuery,
      userId: command.userId || undefined,
      roles: command.roles,
    });
  }

  /**
   * A dry run with no user (an AI agent's) cannot check access, so it may use only the references
   * the saved SQL already has: whoever saved them was checked.
   */
  private refuseReferencesNotSaved(dataMart: DataMart, sql: string): void {
    const options = sqlLexingOptionsFor(dataMart.storage.type);
    const saved = new Set(
      dataMart.definition && isSqlDefinition(dataMart.definition)
        ? parseDataMartReferences(dataMart.definition.sqlQuery, options).map(ref => ref.id)
        : []
    );
    const added = parseDataMartReferences(sql, options).find(ref => !saved.has(ref.id));
    if (added) {
      throw new DataMartSqlReferenceException(
        DataMartSqlReferenceErrorCode.ACCESS_DENIED,
        `Data Mart "${added.title}" can be referenced only from the SQL editor, where access to ` +
          'it is checked.',
        { dataMartId: added.id }
      );
    }
  }
}

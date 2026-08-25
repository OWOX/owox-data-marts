import { Injectable } from '@nestjs/common';
import {
  isConnectorDefinition,
  isSqlDefinition,
  isTableDefinition,
  isTablePatternDefinition,
  isViewDefinition,
} from '../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { CreateViewCommand } from '../dto/domain/create-view.command';
import { DataMartService } from './data-mart.service';
import { CreateViewService } from '../use-cases/create-view.service';
import { DataMart } from '../entities/data-mart.entity';

/**
 * A CALLER-scoped memo for {@link DataMartTableReferenceService.resolveTableName}, for a caller
 * that composes several queries over the same Data Marts in one operation.
 *
 * Resolving a SQL-defined Data Mart is not a read: it runs `CREATE OR REPLACE VIEW` against the
 * customer's warehouse. A schema save that dry-runs a joined formula composes once for the whole
 * metric set and then, if that fails, once more per metric to attribute the failure — so without a
 * memo an N-metric save refreshes every involved Data Mart's view N+1 times.
 *
 * Deliberately NOT a field on the service: it is a Nest singleton, so a cache living there would
 * span requests and hand a later report a view that no longer matches its Data Mart's SQL. Scoping
 * it to one operation keeps "the view is refreshed when a query is composed" true per request while
 * making it true ONCE per request.
 */
export type TableReferenceMemo = Map<string, Promise<string>>;

@Injectable()
export class DataMartTableReferenceService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly createViewService: CreateViewService
  ) {}

  async resolveTableName(
    dataMartId: string,
    projectId: string,
    memo?: TableReferenceMemo
  ): Promise<string> {
    if (!memo) {
      const dataMart = await this.dataMartService.getByIdAndProjectId(dataMartId, projectId);
      return this.resolveTableNameForDataMart(dataMart);
    }
    // The PROMISE is memoized, not the resolved value: two compositions racing on the same Data
    // Mart would otherwise both miss and both issue the DDL. A rejected entry is dropped so a
    // transient failure does not become a permanent one for the rest of the operation.
    const key = `${projectId}␟${dataMartId}`;
    const cached = memo.get(key);
    if (cached) return cached;
    const pending = this.dataMartService
      .getByIdAndProjectId(dataMartId, projectId)
      .then(dataMart => this.resolveTableNameForDataMart(dataMart));
    memo.set(key, pending);
    pending.catch(() => memo.delete(key));
    return pending;
  }

  /**
   * Explicitly refreshes the technical SQL view used as a stable reference for
   * SQL-based Data Marts. Non-SQL definitions do not need this step.
   */
  async ensureSqlViewIsUpToDate(dataMart: DataMart): Promise<string | null> {
    const definition = dataMart.definition;
    if (!definition || !isSqlDefinition(definition)) {
      return null;
    }

    const result = await this.createViewService.run(
      new CreateViewCommand(dataMart.id, dataMart.projectId, this.computeViewName(dataMart.id))
    );

    return result.fullyQualifiedName;
  }

  private async resolveTableNameForDataMart(dataMart: DataMart): Promise<string> {
    const definition = dataMart.definition;
    if (!definition) {
      throw new Error('Data Mart definition is not available.');
    }

    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      return definition.fullyQualifiedName;
    }

    if (isTablePatternDefinition(definition)) {
      return definition.pattern;
    }

    if (isConnectorDefinition(definition)) {
      return definition.connector.storage.fullyQualifiedName;
    }

    if (isSqlDefinition(definition)) {
      const fullyQualifiedName = await this.ensureSqlViewIsUpToDate(dataMart);
      if (!fullyQualifiedName) {
        throw new Error('Failed to refresh SQL Data Mart reference.');
      }
      return fullyQualifiedName;
    }

    throw new Error('Unsupported Data Mart definition for table name retrieval.');
  }

  private computeViewName(dataMartId: string): string {
    return `view_${dataMartId.replace(/-/g, '_')}`;
  }
}

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

@Injectable()
export class DataMartTableReferenceService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly createViewService: CreateViewService
  ) {}

  async resolveTableName(dataMartId: string, projectId: string): Promise<string> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(dataMartId, projectId);

    return this.resolveTableNameForDataMart(dataMart);
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

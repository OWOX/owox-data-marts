import { Injectable } from '@nestjs/common';
import { DataMartService } from '../../services/data-mart.service';
import {
  isConnectorDefinition,
  isSqlDefinition,
  isTableDefinition,
  isTablePatternDefinition,
  isViewDefinition,
} from '../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { CreateViewService } from '../../use-cases/create-view.service';
import { CreateViewCommand } from '../../dto/domain/create-view.command';

/**
 * Tool to retrieve the fully qualified table name for a Data Mart
 */
@Injectable()
export class TableNameRetrieverTool {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly createViewService: CreateViewService
  ) {}

  async retrieveTableName(datamartId: string, projectId: string): Promise<string> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(datamartId, projectId);

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
      const result = await this.createViewService.run(
        new CreateViewCommand(datamartId, projectId, this.computeViewName(datamartId))
      );
      return result.fullyQualifiedName;
    }

    throw new Error('Unsupported Data Mart definition for table name retrieval.');
  }

  private computeViewName(dataMartId: string): string {
    return `ai_insights_view_${dataMartId.replace(/-/g, '_')}`;
  }
}

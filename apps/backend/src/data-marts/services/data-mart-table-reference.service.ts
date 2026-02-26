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

@Injectable()
export class DataMartTableReferenceService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly createViewService: CreateViewService
  ) {}

  async resolveTableName(dataMartId: string, projectId: string): Promise<string> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(dataMartId, projectId);

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
        new CreateViewCommand(dataMartId, projectId, this.computeViewName(dataMartId))
      );
      return result.fullyQualifiedName;
    }

    throw new Error('Unsupported Data Mart definition for table name retrieval.');
  }

  private computeViewName(dataMartId: string): string {
    return `ai_insights_view_${dataMartId.replace(/-/g, '_')}`;
  }
}

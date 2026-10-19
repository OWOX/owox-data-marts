import { Injectable } from '@nestjs/common';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import type {
  DataMartSetupDefinitionDto,
  DataMartSetupScheduleDto,
  DataMartSetupSummaryDto,
} from '../facades/mcp-data-mart-setup.facade';
import { ConnectorDefinitionSchema } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { SqlDefinitionSchema } from '../dto/schemas/data-mart-table-definitions/sql-definition.schema';
import { TableDefinitionSchema } from '../dto/schemas/data-mart-table-definitions/table-definition.schema';
import { TablePatternDefinitionSchema } from '../dto/schemas/data-mart-table-definitions/table-pattern-definition.schema';

@Injectable()
export class McpDataMartSetupMapper {
  toSummary(dataMart: DataMart, origin: string): DataMartSetupSummaryDto {
    return {
      id: dataMart.id,
      title: dataMart.title,
      description: dataMart.description ?? null,
      icon: dataMart.icon ?? null,
      status: dataMart.status,
      definitionType: dataMart.definitionType ?? null,
      revision: dataMart.revision,
      modifiedAt: dataMart.modifiedAt.toISOString(),
      appUrl: new URL(
        `/ui/${encodeURIComponent(dataMart.projectId)}/data-marts/${encodeURIComponent(dataMart.id)}/data-setup`,
        origin
      ).toString(),
    };
  }

  toDefinition(dataMart: DataMart): DataMartSetupDefinitionDto | null {
    if (!dataMart.definition || !dataMart.definitionType) return null;
    switch (dataMart.definitionType) {
      case DataMartDefinitionType.SQL: {
        const definition = SqlDefinitionSchema.parse(dataMart.definition);
        return { type: 'SQL', sqlQuery: definition.sqlQuery };
      }
      case DataMartDefinitionType.TABLE:
      case DataMartDefinitionType.VIEW: {
        const definition = TableDefinitionSchema.parse(dataMart.definition);
        return { type: dataMart.definitionType, fullyQualifiedName: definition.fullyQualifiedName };
      }
      case DataMartDefinitionType.TABLE_PATTERN: {
        const definition = TablePatternDefinitionSchema.parse(dataMart.definition);
        return { type: 'TABLE_PATTERN', pattern: definition.pattern };
      }
      case DataMartDefinitionType.CONNECTOR: {
        const { connector } = ConnectorDefinitionSchema.parse(dataMart.definition);
        // Configuration is arbitrary provider JSON, including credentials and OAuth bindings.
        return {
          type: 'CONNECTOR',
          connectorName: connector.source.name,
          node: connector.source.node,
          fields: [...connector.source.fields],
          version: connector.source.version ?? null,
          fullyQualifiedName: connector.storage.fullyQualifiedName,
          configurationCount: connector.source.configuration.length,
          configuration: 'app-managed',
        };
      }
    }
  }

  toSchedule(trigger: DataMartScheduledTrigger): DataMartSetupScheduleDto {
    return {
      id: trigger.id,
      type: trigger.type,
      enabled: trigger.isActive,
      cronExpression: trigger.cronExpression,
      timeZone: trigger.timeZone,
    };
  }
}

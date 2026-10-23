import { Injectable } from '@nestjs/common';
import { ConnectorFieldsSchema } from '../connector-types/connector-fields-schema';
import {
  ConnectorSpecification,
  ConnectorSpecificationItem,
} from '../connector-types/connector-specification';
import { ConnectorDefinition } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { DataMart } from '../entities/data-mart.entity';
import type {
  McpConnectorConfiguration,
  McpConnectorNode,
  McpConnectorParameter,
  McpConnectorParameterItem,
  McpConnectorSummary,
} from '../facades/mcp-connectors.facade';

@Injectable()
export class McpConnectorsMapper {
  toSummary(
    connector: { name: string; title: string; description?: string | null; docUrl?: string | null },
    metadata: Pick<McpConnectorSummary, 'id' | 'isCustom' | 'activeVersion' | 'capabilities'>
  ): McpConnectorSummary {
    return {
      id: metadata.id,
      name: connector.name,
      title: connector.title,
      description: connector.description ?? null,
      docUrl: connector.docUrl ?? null,
      isCustom: metadata.isCustom,
      activeVersion: metadata.activeVersion,
      capabilities: {
        singleConfiguration: metadata.capabilities.singleConfiguration,
        copySecretsByValue: metadata.capabilities.copySecretsByValue,
      },
    };
  }

  toSpecification(specification: ConnectorSpecification): McpConnectorParameter[] {
    return specification.map(parameter => ({
      ...this.toParameterItem(parameter),
      oneOf: parameter.oneOf?.map(option => ({
        label: option.label,
        value: option.value,
        requiredType: option.requiredType,
        attributes: option.attributes,
        items: Object.fromEntries(
          Object.entries(option.items).map(([name, item]) => [
            name,
            this.toParameterItem(
              item,
              this.isSensitive(parameter.attributes) || this.isSensitive(option.attributes)
            ),
          ])
        ),
      })),
    }));
  }

  private toParameterItem(
    item: ConnectorSpecificationItem,
    sensitiveParent = false
  ): McpConnectorParameterItem {
    const sensitive = sensitiveParent || this.isSensitive(item.attributes);
    return {
      name: item.name,
      title: item.title,
      description: item.description,
      requiredType: item.requiredType,
      required: item.required,
      minimum: item.minimum,
      attributes: item.attributes,
      optionsDependsOn: item.optionsDependsOn,
      ...(!sensitive
        ? { default: item.default, options: item.options, placeholder: item.placeholder }
        : {}),
    };
  }

  private isSensitive(attributes?: string[]): boolean {
    return (
      attributes?.some(attribute => attribute === 'SECRET' || attribute === 'OAUTH_FLOW') ?? false
    );
  }

  toPublicConfiguration(configuration: Record<string, unknown>): Record<string, unknown> {
    return this.toPublicValue(configuration) as Record<string, unknown>;
  }

  private toPublicValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(item => this.toPublicValue(item));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !key.startsWith('_'))
        .map(([key, nested]) => [key, this.toPublicValue(nested)])
    );
  }

  toConfigurations(
    dataMart: Pick<DataMart, 'id' | 'title'>,
    definition: ConnectorDefinition
  ): McpConnectorConfiguration[] {
    const source = definition.connector.source;
    return source.configuration.flatMap(configuration => {
      if (typeof configuration._id !== 'string' || !configuration._id.trim()) return [];
      return [
        {
          dataMartId: dataMart.id,
          dataMartTitle: dataMart.title,
          configurationId: configuration._id,
          connectorName: source.name,
          version: source.version ?? null,
          configuration: this.toPublicConfiguration(configuration),
        },
      ];
    });
  }

  toNodes(nodes: ConnectorFieldsSchema): McpConnectorNode[] {
    return nodes.map(node => ({
      name: node.name,
      overview: node.overview,
      description: node.description,
      documentation: node.documentation,
      uniqueKeys: node.uniqueKeys,
      uniqueKeysByDataLevel: node.uniqueKeysByDataLevel,
      defaultFields: node.defaultFields,
      destinationName: node.destinationName,
      fields: node.fields?.map(field => ({
        name: field.name,
        type: field.type,
        description: field.description,
      })),
    }));
  }
}

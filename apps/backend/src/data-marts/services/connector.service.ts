import { Injectable, Logger } from '@nestjs/common';

// @ts-expect-error - Package lacks TypeScript declarations
import { AvailableConnectors, Connectors, Core } from '@owox/connectors';

import { ConnectorDefinition } from '../connector-types/connector-definition';
import { ConnectorSpecification } from '../connector-types/connector-specification';
import { ConnectorFieldsSchema } from '../connector-types/connector-fields-schema';

interface ConnectorConfigField {
  displayName: string;
  description: string;
  default: unknown;
  requiredType: string;
  isRequired: boolean;
  options?: unknown[];
  placeholder?: string;
  showInUI?: boolean;
}

interface ConnectorConfig {
  [key: string]: ConnectorConfigField;
}

interface SourceFieldDefinition {
  type: string;
  description: string;
}

interface SourceFieldsGroup {
  overview: string;
  description: string;
  documentation: string;
  uniqueKeys: string[];
  fields: Record<string, SourceFieldDefinition>;
}

interface SourceFieldsSchema {
  [key: string]: SourceFieldsGroup;
}

@Injectable()
export class ConnectorService {
  private readonly logger = new Logger(ConnectorService.name);

  /**
   * Get all available connectors
   */
  async getAvailableConnectors(): Promise<ConnectorDefinition[]> {
    return AvailableConnectors.map(connector => ({
      name: connector,
      title: connector,
      description: null,
      icon: null,
    }));
  }

  /**
   * Get connector specification for a given connector
   */
  async getConnectorSpecification(connectorName: string): Promise<ConnectorSpecification> {
    this.validateConnectorExists(connectorName);

    const source = this.createConnectorSource(connectorName);
    const configSchema = this.mapConfigToSchema(source.config);

    return ConnectorSpecification.parse(configSchema);
  }

  /**
   * Get connector fields schema for a given connector
   */
  async getConnectorFieldsSchema(connectorName: string): Promise<ConnectorFieldsSchema> {
    this.validateConnectorExists(connectorName);

    const sourceInstance = this.createConnectorSource(connectorName);
    let sourceFieldsSchema: SourceFieldsSchema;
    try {
      sourceFieldsSchema = sourceInstance.getFieldsSchema();
    } catch (error) {
      this.logger.warn(
        `Error getting fields schema for connector ${connectorName}: ${error.message}`
      );
      sourceFieldsSchema = {};
    }
    const fieldsSchema = this.mapFieldsSchemaToDto(sourceFieldsSchema);

    return ConnectorFieldsSchema.parse(fieldsSchema);
  }

  // Private helper methods

  private validateConnectorExists(connectorName: string): void {
    if (Object.keys(Connectors).length === 0) {
      throw new Error('No connectors found');
    }

    if (!Object.keys(Connectors).includes(connectorName)) {
      throw new Error(`Connector '${connectorName}' not found`);
    }
  }

  private createConnectorSource(connectorName: string) {
    const source = Connectors[connectorName][`${connectorName}Source`];
    return new source(new Core.AbstractConfig({}));
  }

  private mapConfigToSchema(config: ConnectorConfig) {
    return Object.keys(config).map(key => ({
      name: key,
      title: config[key].displayName,
      description: config[key].description,
      default: config[key].default,
      requiredType: config[key].requiredType,
      required: config[key].isRequired,
      options: config[key].options,
      placeholder: config[key].placeholder,
      showInUI: config[key].showInUI,
    }));
  }

  private mapFieldsSchemaToDto(sourceFieldsSchema: SourceFieldsSchema) {
    return Object.keys(sourceFieldsSchema).map(key => ({
      name: key,
      overview: sourceFieldsSchema[key].overview,
      description: sourceFieldsSchema[key].description,
      documentation: sourceFieldsSchema[key].documentation,
      uniqueKeys: sourceFieldsSchema[key].uniqueKeys,
      fields: Object.keys(sourceFieldsSchema[key].fields).map(fieldKey => ({
        name: fieldKey,
        type: sourceFieldsSchema[key].fields[fieldKey].type,
        description: sourceFieldsSchema[key].fields[fieldKey].description,
      })),
    }));
  }
}

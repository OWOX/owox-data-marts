import { Injectable, Logger } from '@nestjs/common';

// @ts-expect-error - Package lacks TypeScript declarations
import { AvailableConnectors, Connectors, Core } from '@owox/connectors';

import { ConnectorDefinition } from '../../connector-types/connector-definition';
import { ConnectorSpecification } from '../../connector-types/connector-specification';
import { ConnectorFieldsSchema } from '../../connector-types/connector-fields-schema';

interface ConnectorSpecificationOneOf {
  label: string;
  value: string;
  requiredType: string;
  items: Record<string, ConnectorConfigField>;
}

interface ConnectorConfigField {
  description: string;
  label: string;
  default: unknown;
  requiredType: string;
  isRequired: boolean;
  options?: unknown[];
  placeholder?: string;
  attributes?: Core.CONFIG_ATTRIBUTES[];
  oneOf?: ConnectorSpecificationOneOf[];
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
  destinationName: string;
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
    return AvailableConnectors.map(connector => {
      const manifest = this.getConnectorManifest(connector);
      return {
        name: connector,
        title: manifest.title,
        description: manifest.description,
        logo: manifest.logo,
        docUrl: manifest.docUrl,
      };
    });
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

  private getConnectorManifest(connectorName: string) {
    const manifest = Connectors[connectorName].manifest;
    return manifest;
  }

  private mapConfigToSchema(config: ConnectorConfig) {
    return Object.keys(config).map(key => ({
      name: key,
      title: config[key].label,
      description: config[key].description,
      default: config[key].default,
      requiredType: config[key].requiredType,
      required: config[key].isRequired,
      options: config[key].options,
      placeholder: config[key].placeholder,
      attributes: config[key].attributes,
      oneOf: config[key].oneOf?.map(oneOf => ({
        label: oneOf.label,
        value: oneOf.value,
        requiredType: oneOf.requiredType,
        items: Object.entries(oneOf.items).reduce(
          (acc, [itemKey, itemValue]) => {
            acc[itemKey] = {
              name: itemKey,
              title: itemValue.label,
              description: itemValue.description,
              default: itemValue.default,
              requiredType: itemValue.requiredType,
              required: itemValue.isRequired,
              options: itemValue.options,
              placeholder: itemValue.placeholder,
              attributes: itemValue.attributes,
            };
            return acc;
          },
          {} as Record<string, unknown>
        ),
      })),
    }));
  }

  private mapFieldsSchemaToDto(sourceFieldsSchema: SourceFieldsSchema) {
    return Object.keys(sourceFieldsSchema).map(key => ({
      name: key,
      overview: sourceFieldsSchema[key].overview,
      description: sourceFieldsSchema[key].description,
      documentation: sourceFieldsSchema[key].documentation,
      uniqueKeys: sourceFieldsSchema[key].uniqueKeys,
      destinationName: sourceFieldsSchema[key].destinationName,
      fields: Object.keys(sourceFieldsSchema[key].fields).map(fieldKey => ({
        name: fieldKey,
        type: sourceFieldsSchema[key].fields[fieldKey].type,
        description: sourceFieldsSchema[key].fields[fieldKey].description,
      })),
    }));
  }
}

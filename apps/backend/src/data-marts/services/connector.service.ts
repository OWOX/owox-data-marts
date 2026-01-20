import { Injectable, Logger } from '@nestjs/common';

// @ts-expect-error - Package lacks TypeScript declarations
import { AvailableConnectors, Connectors, Core } from '@owox/connectors';

import { ConnectorDefinition } from '../connector-types/connector-definition';
import {
  ConnectorSpecification,
  ConnectorSpecificationItem,
} from '../connector-types/connector-specification';
import { ConnectorFieldsSchema } from '../connector-types/connector-fields-schema';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';
import { ConnectorOauthCredentials } from '../connector-types/interfaces/connector-oauth-credentials';
import { OAuthVar, OAuthAttribute } from '../connector-types/connector-oauth-schema';

interface ConnectorSpecificationOneOf {
  label: string;
  value: string;
  requiredType: string;
  attributes?: Core.CONFIG_ATTRIBUTES[];
  oauthParams?: Record<string, unknown>;
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
  defaultFields?: string[];
  destinationName: string;
  fields: Record<string, SourceFieldDefinition>;
}

interface SourceFieldsSchema {
  [key: string]: SourceFieldsGroup;
}

@Injectable()
export class ConnectorService {
  private readonly logger = new Logger(ConnectorService.name);

  constructor(
    private readonly connectorSourceCredentialsService: ConnectorSourceCredentialsService
  ) {}
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

  async getOAuthUiVariables(
    connectorName: string,
    fieldPath: string
  ): Promise<Record<string, unknown>> {
    const specification = await this.getConnectorSpecification(connectorName);
    const paths = fieldPath.split('.');
    const item = this.getItemFromSpecRecursively(specification, paths);
    if (item.attributes?.includes(Core.CONFIG_ATTRIBUTES.OAUTH_FLOW)) {
      return item.oauthParams?.ui_variables as Record<string, unknown>;
    }
    return {};
  }

  async getOAuthUiVariablesExpanded(
    connectorName: string,
    fieldPath: string
  ): Promise<Record<string, unknown>> {
    const specification = await this.getConnectorSpecification(connectorName);
    const paths = fieldPath.split('.');
    const item = this.getItemFromSpecRecursively(specification, paths);
    if (item.attributes?.includes(Core.CONFIG_ATTRIBUTES.OAUTH_FLOW)) {
      const oauthParams = item.oauthParams as Record<string, unknown>;

      if (oauthParams?.vars) {
        return this.parseOAuthVars(oauthParams.vars as Record<string, unknown>, ['UI']);
      }

      throw new Error(`UI variables not found for field path ${fieldPath}`);
    }
    return {};
  }

  async isOAuthEnabled(connectorName: string, fieldPath: string): Promise<boolean> {
    const specification = await this.getConnectorSpecification(connectorName);
    const paths = fieldPath.split('.');
    const item = this.getItemFromSpecRecursively(specification, paths);

    if (!item.attributes?.includes(Core.CONFIG_ATTRIBUTES.OAUTH_FLOW)) {
      return false;
    }

    const oauthParams = item.oauthParams as Record<string, unknown>;
    if (!oauthParams?.vars) {
      return false;
    }

    const vars = oauthParams.vars as Record<string, unknown>;

    for (const [, varConfig] of Object.entries(vars)) {
      const config = varConfig as OAuthVar;

      const isRequired = config.required === true;
      const isSecret = config.attributes?.includes('SECRET');

      if (isRequired && isSecret && config.store === 'env') {
        const envValue = process.env[config.key];
        if (!envValue) {
          return false;
        }
      }
    }

    return true;
  }

  async exchangeCredential(
    projectId: string,
    userId: string,
    connectorName: string,
    fieldPath: string,
    payload: unknown
  ): Promise<{
    credentialId: string;
    user?: { id?: string; name?: string; email?: string; picture?: string };
    additional?: Record<string, unknown>;
    warnings?: string[];
  }> {
    const connector = this.createConnectorSource(connectorName);
    const oauthVariables = await this.getSourceOauthVariables(connectorName, fieldPath);
    const exchanged = (await connector.exchangeOauthCredentials(
      payload,
      oauthVariables
    )) as ConnectorOauthCredentials;
    const credential = await this.connectorSourceCredentialsService.createCredentials(
      projectId,
      userId,
      connectorName,
      exchanged.secret,
      exchanged.expiresIn !== null && exchanged.expiresIn !== undefined
        ? new Date(Date.now() + exchanged.expiresIn * 1000)
        : null,
      exchanged.user
    );
    return {
      credentialId: credential.id,
      user: exchanged.user,
      additional: exchanged.additional,
      warnings: exchanged.warnings,
    };
  }

  /**
   * Refresh credentials for a connector configuration
   * @param projectId - Project ID
   * @param connectorName - Connector name (e.g., "FacebookMarketing")
   * @param configuration - The configuration object from data mart
   * @param credentialId - The credential ID to refresh
   * @returns Updated credential ID (may be same or new if refreshed)
   */
  async refreshCredentials(
    projectId: string,
    connectorName: string,
    configuration: Record<string, unknown>,
    credentialId: string
  ): Promise<string> {
    const credential =
      await this.connectorSourceCredentialsService.getCredentialsById(credentialId);

    if (!credential) {
      throw new Error(`Credential with ID ${credentialId} not found`);
    }

    const connector = this.createConnectorSource(connectorName);

    const oauthVariables = await this.getOAuthVariablesForRefresh(connectorName, configuration);

    const credentialsWithExpiry = {
      ...credential.credentials,
      expiresAt: credential.expiresAt?.getTime() ?? null,
    };

    const refreshedCredentials = await connector.refreshCredentials(
      configuration,
      credentialsWithExpiry,
      oauthVariables
    );

    if (!refreshedCredentials) {
      return credentialId;
    }

    const newCredential = await this.connectorSourceCredentialsService.createCredentials(
      projectId,
      credential.userId ?? '',
      connectorName,
      refreshedCredentials.secret,
      new Date(Date.now() + refreshedCredentials.expiresIn * 1000),
      refreshedCredentials.user
    );

    return newCredential.id;
  }

  /**
   * Get OAuth variables needed for credential refresh
   */
  private async getOAuthVariablesForRefresh(
    connectorName: string,
    configuration: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // Find the OAuth field path from configuration
    // Configuration from data mart has structure: { AuthType: { oauth2: { ... } } }
    // We need to extract the auth type key (e.g., "oauth2")
    const authType = configuration.AuthType as Record<string, unknown> | undefined;
    if (!authType) {
      return {};
    }

    // Get the first key from AuthType object (e.g., "oauth2" or "accessToken")
    const authTypeKey = Object.keys(authType)[0];
    if (!authTypeKey) {
      return {};
    }

    const fieldPath = `AuthType.${authTypeKey}`;

    try {
      return await this.getSourceOauthVariables(connectorName, fieldPath);
    } catch {
      return {};
    }
  }

  private getItemFromSpecRecursively(
    specification: ConnectorSpecification | Record<string, ConnectorSpecificationItem>,
    paths: string[]
  ): ConnectorSpecificationItem {
    if (paths.length === 0) {
      throw new Error('Path cannot be empty');
    }

    const [currentPath, ...remainingPaths] = paths;

    let currentItem: ConnectorSpecificationItem | undefined;

    if (Array.isArray(specification)) {
      currentItem = specification.find(spec => spec.name === currentPath);
    } else {
      currentItem = specification[currentPath];
    }

    if (!currentItem) {
      throw new Error(`Field "${currentPath}" not found in specification`);
    }

    if (remainingPaths.length === 0) {
      return currentItem;
    }

    if ('oneOf' in currentItem && currentItem.oneOf && Array.isArray(currentItem.oneOf)) {
      const nextPath = remainingPaths[0];

      const oneOfVariant = currentItem.oneOf.find(variant => variant.value === nextPath);

      if (oneOfVariant) {
        if (remainingPaths.length === 1) {
          return {
            name: nextPath,
            ...oneOfVariant,
          } as ConnectorSpecificationItem;
        }

        if (oneOfVariant.items) {
          return this.getItemFromSpecRecursively(oneOfVariant.items, remainingPaths.slice(1));
        }
      }
    }

    throw new Error(`Path "${paths.join('.')}" not found in specification`);
  }

  private parseOAuthVars(
    vars: Record<string, unknown>,
    filterAttributes?: OAuthAttribute[]
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, varConfig] of Object.entries(vars)) {
      const config = varConfig as OAuthVar;

      if (filterAttributes && filterAttributes.length > 0) {
        const hasRequiredAttribute = filterAttributes.some(attr =>
          config.attributes?.includes(attr)
        );
        if (!hasRequiredAttribute) {
          continue;
        }
      }

      let value: unknown;
      if (config.store === 'env' && config.key) {
        const envValue = process.env[config.key];
        if (!envValue) {
          if (config.default) {
            value = config.default;
          } else if (config.required) {
            value = null;
          }
        } else {
          value = envValue;
        }
      } else if (config.default !== undefined) {
        value = config.default;
      } else {
        value = null;
      }

      result[key] = value;
    }

    return result;
  }

  async getSourceOauthVariables(
    connectorName: string,
    fieldPath: string
  ): Promise<Record<string, unknown>> {
    const specification = await this.getConnectorSpecification(connectorName);
    const paths = fieldPath.split('.');
    const item = this.getItemFromSpecRecursively(specification, paths);

    if (!item.attributes?.includes(Core.CONFIG_ATTRIBUTES.OAUTH_FLOW)) {
      throw new Error(`Field "${fieldPath}" is not an OAuth flow field`);
    }

    const oauthParams = item.oauthParams as Record<string, unknown>;

    if (!oauthParams?.vars) {
      throw new Error(`Variables not found for field path ${fieldPath}`);
    }

    return this.parseOAuthVars(oauthParams.vars as Record<string, unknown>);
  }

  /**
   * Get specification item by field path (e.g., "AuthType.oauth2")
   */
  async getItemByFieldPath(
    connectorName: string,
    fieldPath: string
  ): Promise<ConnectorSpecificationItem> {
    const specification = await this.getConnectorSpecification(connectorName);
    const paths = fieldPath.split('.');
    return this.getItemFromSpecRecursively(specification, paths);
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
    const result = Object.keys(config).map(key => {
      const item = {
        name: key,
        title: config[key].label,
        description: config[key].description,
        default: config[key].default,
        requiredType: config[key].requiredType,
        required: config[key].isRequired,
        options: config[key].options,
        placeholder: config[key].placeholder,
        attributes: config[key].attributes,
        oneOf: config[key].oneOf?.map(oneOf => {
          return {
            label: oneOf.label,
            value: oneOf.value,
            requiredType: oneOf.requiredType,
            attributes: oneOf.attributes,
            oauthParams: oneOf.oauthParams,
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
          };
        }),
      };
      return item;
    });
    return result;
  }

  private mapFieldsSchemaToDto(sourceFieldsSchema: SourceFieldsSchema) {
    return Object.keys(sourceFieldsSchema).map(key => ({
      name: key,
      overview: sourceFieldsSchema[key].overview,
      description: sourceFieldsSchema[key].description,
      documentation: sourceFieldsSchema[key].documentation,
      uniqueKeys: sourceFieldsSchema[key].uniqueKeys,
      defaultFields: sourceFieldsSchema[key].defaultFields,
      destinationName: sourceFieldsSchema[key].destinationName,
      fields: Object.keys(sourceFieldsSchema[key].fields).map(fieldKey => ({
        name: fieldKey,
        type: sourceFieldsSchema[key].fields[fieldKey].type,
        description: sourceFieldsSchema[key].fields[fieldKey].description,
      })),
    }));
  }
}

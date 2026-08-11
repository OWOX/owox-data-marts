import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';

import { AvailableConnectors, Connectors, Core } from '@owox/connectors';

import { ConnectorDefinition } from '../../connector-types/connector-definition';
import {
  ConnectorSpecification,
  ConnectorSpecificationItem,
} from '../../connector-types/connector-specification';
import { ConnectorFieldsSchema } from '../../connector-types/connector-fields-schema';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';
import { ConnectorDefinitionService } from './connector-definition.service';
import { ConnectorOauthCredentials } from '../../connector-types/interfaces/connector-oauth-credentials';
import { OAuthVar, OAuthAttribute } from '../../connector-types/connector-oauth-schema';
import {
  mapConnectorFieldsSchema,
  type SourceFieldsSchema,
} from './connector-fields-schema.mapper';
import type { ConnectorCapabilities } from '../../connector-types/connector-capabilities';
import { ConnectorCredentialBoundaryError } from '../../errors/connector-credential-boundary.error';

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
  minimum?: number;
  attributes?: Core.CONFIG_ATTRIBUTES[];
  oneOf?: ConnectorSpecificationOneOf[];
}

interface ConnectorConfig {
  [key: string]: ConnectorConfigField;
}

/**
 * The capabilities of a connector that declares none. Frozen because it is handed
 * out as-is rather than copied per call. See resolveConnectorCapabilities.
 */
const NO_CAPABILITIES: ConnectorCapabilities = Object.freeze({
  singleConfiguration: false,
  copySecretsByValue: false,
});

@Injectable()
export class ConnectorService {
  private readonly logger = new Logger(ConnectorService.name);

  constructor(
    private readonly connectorSourceCredentialsService: ConnectorSourceCredentialsService,
    private readonly connectorDefinitionService: ConnectorDefinitionService
  ) {}
  /**
   * Get all available connectors
   */
  async getAvailableConnectors(): Promise<ConnectorDefinition[]> {
    return AvailableConnectors.map(connector => {
      const manifest = this.getConnectorManifest(connector);
      // description/logo/docUrl are nullable in the DTO; coalesce to null so the
      // keys are always present (a minimal manifest may omit them, and JSON drops
      // `undefined` over the wire, breaking the "key always present" contract).
      return {
        name: connector,
        title: manifest.title,
        description: manifest.description ?? null,
        logo: manifest.logo ?? null,
        docUrl: manifest.docUrl ?? null,
      };
    });
  }

  /**
   * Reads the capabilities a bundled connector declares in its manifest.
   *
   * Bundled-only by contract: it 404s on any name outside the build-time bundle,
   * and a custom connector's name can never be in that bundle (creation rejects
   * names colliding with bundled ones). Callers that may see a custom connector —
   * anything driven by a Data Mart definition or an API request — must use
   * resolveConnectorCapabilities instead.
   */
  getConnectorCapabilities(connectorName: string): ConnectorCapabilities {
    this.validateConnectorExists(connectorName);
    const capabilities = this.getConnectorManifest(connectorName)?.capabilities;

    return {
      singleConfiguration: capabilities?.singleConfiguration === true,
      copySecretsByValue: capabilities?.copySecretsByValue === true,
    };
  }

  /**
   * Resolves the capabilities of either a bundled connector or a custom (DB-stored)
   * one. Symmetric to resolveConnectorSpecification: bundled names win first (no DB
   * lookup), then a custom manifest, else the existing 404 path.
   *
   * A custom connector resolves to NO_CAPABILITIES — its stored manifest's own
   * `capabilities` block is deliberately NOT read. That manifest is unvalidated user
   * JSON (nothing in the connectors Core or ManifestParser reads or validates
   * `capabilities`), so honouring it would let an author flip flags that relax input
   * validation and steer credential copying.
   */
  async resolveConnectorCapabilities(
    projectId: string,
    connectorName: string,
    version?: number
  ): Promise<ConnectorCapabilities> {
    if (Object.keys(Connectors).includes(connectorName)) {
      return this.getConnectorCapabilities(connectorName);
    }
    const manifest = await this.connectorDefinitionService.tryResolveManifest(
      projectId,
      connectorName,
      version
    );
    if (manifest) {
      return NO_CAPABILITIES;
    }
    return this.getConnectorCapabilities(connectorName);
  }

  /**
   * Get connector specification for a given connector
   */
  async getConnectorSpecification(connectorName: string): Promise<ConnectorSpecification> {
    this.validateConnectorExists(connectorName);

    const source = this.createConnectorSource(connectorName);
    const configSchema = this.mapConfigToSchema(source.parameters);

    return ConnectorSpecification.parse(configSchema);
  }

  /**
   * Resolves a connector specification for either a bundled connector or a custom
   * (DB-stored) one. Bundled names are canonical and cannot collide with custom
   * names (reserved-name guard at creation), so we check the bundle first to avoid
   * a DB lookup. For a custom connector we resolve its published manifest and build
   * the spec from it; for an unknown name we preserve the existing 404.
   */
  async resolveConnectorSpecification(
    projectId: string,
    connectorName: string,
    version?: number
  ): Promise<ConnectorSpecification> {
    if (Object.keys(Connectors).includes(connectorName)) {
      return this.getConnectorSpecification(connectorName);
    }
    const manifest = await this.connectorDefinitionService.tryResolveManifest(
      projectId,
      connectorName,
      version
    );
    if (manifest) {
      return this.getSpecificationFromManifest(manifest);
    }
    return this.getConnectorSpecification(connectorName);
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
    const fieldsSchema = mapConnectorFieldsSchema(sourceFieldsSchema);

    return ConnectorFieldsSchema.parse(fieldsSchema);
  }

  /**
   * Build the specification DTO from a raw declarative manifest (used by custom
   * connectors that are not in the bundle). Reuses the same mapper as bundled
   * connectors so the output shape is identical.
   */
  getSpecificationFromManifest(manifest: Record<string, unknown>): ConnectorSpecification {
    const source = this.createDeclarativeSourceFromManifest(manifest);
    return ConnectorSpecification.parse(this.mapConfigToSchema(source.parameters));
  }

  getFieldsSchemaFromManifest(manifest: Record<string, unknown>): ConnectorFieldsSchema {
    const source = this.createDeclarativeSourceFromManifest(manifest);
    return ConnectorFieldsSchema.parse(
      mapConnectorFieldsSchema(source.getFieldsSchema() as SourceFieldsSchema)
    );
  }

  /**
   * Resolves the fields schema for a bundled or custom connector. Symmetric to
   * resolveConnectorSpecification: bundled names win first (no DB lookup), then a
   * custom manifest, else the existing 404 path.
   */
  async resolveConnectorFieldsSchema(
    projectId: string,
    connectorName: string,
    version?: number
  ): Promise<ConnectorFieldsSchema> {
    if (Object.keys(Connectors).includes(connectorName)) {
      return this.getConnectorFieldsSchema(connectorName);
    }
    const manifest = await this.connectorDefinitionService.tryResolveManifest(
      projectId,
      connectorName,
      version
    );
    if (manifest) {
      return this.getFieldsSchemaFromManifest(manifest);
    }
    return this.getConnectorFieldsSchema(connectorName);
  }

  private createDeclarativeSourceFromManifest(manifest: Record<string, unknown>) {
    const context = new Core.AbstractContext({
      source: { name: 'custom', config: {} },
      storage: { name: 'unused', config: {} },
      runConfig: {},
      env: { datamartId: null, runId: null },
    });
    let model;
    try {
      model = new Core.ManifestParser().parse(JSON.stringify(manifest));
    } catch (e) {
      throw new BadRequestException(`Invalid declarative manifest: ${(e as Error).message}`);
    }
    return new Core.DeclarativeSource(context, model);
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
      if (isRequired && config.store === 'env') {
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
    const expiresAt =
      exchanged.expiresIn !== null && exchanged.expiresIn !== undefined
        ? new Date(Date.now() + exchanged.expiresIn * 1000)
        : null;

    const credential = await this.connectorSourceCredentialsService.createCredentials(
      projectId,
      userId,
      connectorName,
      exchanged.secret,
      expiresAt,
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

    // Tenant boundary: never read or copy a credential that belongs to another
    // project, even if its id is referenced from this project's configuration.
    // The message stays deliberately indistinguishable from "not found" so that the
    // caller learns nothing about credentials outside its project.
    if (credential.projectId !== projectId) {
      throw new ConnectorCredentialBoundaryError(`Credential with ID ${credentialId} not found`);
    }

    // Connector boundary: a credential must only be refreshed under the connector
    // it was issued for. Otherwise one connector's stored tokens could be rotated
    // and re-stored under a different connector name.
    if (credential.connectorName !== connectorName) {
      throw new ConnectorCredentialBoundaryError(
        `Credential belongs to connector ${credential.connectorName}, not ${connectorName}`
      );
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
      throw new NotFoundException('No connectors found');
    }

    if (!Object.keys(Connectors).includes(connectorName)) {
      throw new NotFoundException(`Connector '${connectorName}' not found`);
    }
  }

  private createConnectorSource(connectorName: string) {
    const context = new Core.AbstractContext({
      source: { name: connectorName, config: {} },
      storage: { name: 'unused', config: {} },
      runConfig: {},
      env: { datamartId: null, runId: null },
    });

    const SourceClass = Connectors[connectorName][`${connectorName}Source`];
    if (SourceClass) {
      return new SourceClass(context);
    }

    // Manifest-only declarative connector: no Source class is bundled, but the
    // manifest carries the node definitions. DeclarativeSource exposes the same
    // `parameters` and `getFieldsSchema()` contract, so spec/fields work unchanged.
    // Detection mirrors connector-runner.js (truthiness of manifest.nodes).
    const manifest = Connectors[connectorName].manifest;
    if (manifest && manifest.nodes) {
      let model;
      try {
        model = new Core.ManifestParser().parse(JSON.stringify(manifest));
      } catch (e) {
        this.logger.error(
          `Failed to parse declarative manifest for '${connectorName}': ${(e as Error).message}`
        );
        throw new InternalServerErrorException(
          `Connector '${connectorName}' has an invalid declarative manifest`
        );
      }
      return new Core.DeclarativeSource(context, model);
    }

    this.logger.error(
      `Connector '${connectorName}' has neither a '${connectorName}Source' class nor a declarative manifest`
    );
    throw new InternalServerErrorException(`Connector '${connectorName}' is misconfigured`);
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
        minimum: config[key].minimum,
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
                  minimum: itemValue.minimum,
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
}

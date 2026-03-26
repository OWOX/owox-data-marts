import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConnectorDefinition } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { ConnectorService } from './connector.service';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';
// @ts-expect-error - Package lacks TypeScript declarations
import { Core } from '@owox/connectors';

export const SECRET_MASK = '**********' as const;

@Injectable()
/**
 * Service for masking and merging secret fields in connector definitions.
 *
 * The source of truth for which fields are secret is the connector specification
 * (attribute `SECRET`). Based on it, the service:
 * - masks secret fields in persisted definitions before returning them to clients;
 * - merges secret fields during updates to avoid overwriting stored values with placeholders;
 * - extracts and saves non-OAuth secrets to a separate table for security.
 */
export class ConnectorSecretService {
  constructor(
    private readonly connectorService: ConnectorService,
    private readonly connectorSourceCredentialsService: ConnectorSourceCredentialsService
  ) {}

  /**
   * Checks whether a value is a secret mask.
   *
   * Used as a type guard to distinguish actual values from placeholders that
   * hide secrets in client-provided input.
   *
   * @param value Value to check
   * @returns True if the value equals {@link SECRET_MASK}
   */
  private isSecretMask(value: unknown): value is typeof SECRET_MASK {
    return typeof value === 'string' && value === SECRET_MASK;
  }

  /**
   * Collects all secret field names recursively from oneOf items.
   *
   * @param specification Connector specification
   * @returns Set of all secret field names including nested ones
   */
  private async getAllSecretFieldNames(connectorName: string): Promise<Set<string>> {
    const specification = await this.connectorService.getConnectorSpecification(connectorName);
    const secretFields = new Set<string>();

    const collectSecretFields = (fields: unknown[]): void => {
      for (const field of fields as Array<{
        name: string;
        attributes?: string[];
        oneOf?: unknown;
      }>) {
        if ((field.attributes || []).includes(Core.CONFIG_ATTRIBUTES.SECRET)) {
          secretFields.add(field.name);
        }

        if (field.oneOf && Array.isArray(field.oneOf)) {
          for (const oneOfOption of field.oneOf) {
            if (oneOfOption.items) {
              const nestedFields = Object.values(oneOfOption.items);
              collectSecretFields(
                nestedFields as Array<{ name: string; attributes?: string[]; oneOf?: unknown }>
              );
            }
          }
        }
      }
    };

    collectSecretFields(specification);
    return secretFields;
  }

  /**
   * Recursively extracts secret values from a configuration object.
   * Returns secrets with their full path (e.g., "AuthType.oauth2.RefreshToken")
   *
   * @param obj Object to extract secrets from
   * @param secretFieldNames Set of secret field names to look for
   * @param path Current path prefix
   * @returns Object with path -> value pairs for found secrets
   */
  private extractSecretsRecursively(
    obj: Record<string, unknown>,
    secretFieldNames: Set<string>,
    path: string = ''
  ): Record<string, unknown> {
    const secrets: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Skip internal fields
      if (key.startsWith('_')) {
        continue;
      }

      const currentPath = path ? `${path}.${key}` : key;

      if (secretFieldNames.has(key)) {
        // Found a secret field
        if (value !== undefined && value !== null && !this.isSecretMask(value)) {
          secrets[currentPath] = value;
        }
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Recurse into nested objects
        const nestedSecrets = this.extractSecretsRecursively(
          value as Record<string, unknown>,
          secretFieldNames,
          currentPath
        );
        Object.assign(secrets, nestedSecrets);
      }
    }

    return secrets;
  }

  /**
   * Removes secret values from a configuration object (recursively).
   *
   * @param obj Object to remove secrets from (mutates in place)
   * @param secretFieldNames Set of secret field names to remove
   */
  private removeSecretsRecursively(
    obj: Record<string, unknown>,
    secretFieldNames: Set<string>
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith('_')) {
        continue;
      }

      if (secretFieldNames.has(key)) {
        delete obj[key];
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        this.removeSecretsRecursively(value as Record<string, unknown>, secretFieldNames);
      }
    }
  }

  /**
   * Checks if object has _source_credential_id anywhere (recursively).
   * This indicates OAuth flow is used and secrets are already externalized.
   */
  private hasSourceCredentialIdRecursively(obj: Record<string, unknown>): boolean {
    for (const [key, value] of Object.entries(obj)) {
      if (key === '_source_credential_id') {
        return true;
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (this.hasSourceCredentialIdRecursively(value as Record<string, unknown>)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Injects secrets back into a configuration object at their original paths.
   * Paths are dot-separated strings like "AuthType.oauth2.RefreshToken".
   *
   * @param obj Object to inject secrets into (mutates in place)
   * @param secrets Object with path -> value pairs
   */
  injectSecretsAtPaths(obj: Record<string, unknown>, secrets: Record<string, unknown>): void {
    for (const [path, value] of Object.entries(secrets)) {
      const parts = path.split('.');
      let current = obj;

      // Navigate to the parent object
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current[part] || typeof current[part] !== 'object') {
          current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
      }

      // Set the value
      const lastPart = parts[parts.length - 1];
      current[lastPart] = value;
    }
  }

  /**
   * Extracts secrets from configuration and saves them to a separate table.
   * Handles nested structures like AuthType.oauth2.{secrets}.
   * Updates the definition to reference the stored secrets via _secrets_id.
   *
   * This method:
   * 1. Gets all SECRET field names from connector specification (including nested)
   * 2. For each configuration item:
   *    - Recursively extracts secret values with their paths
   *    - If it has _secrets_id, updates the existing secrets record
   *    - If it has secrets but no _secrets_id, creates a new record
   *    - Removes secret values from the configuration (recursively)
   *    - Adds _secrets_id reference to the stored secrets
   *
   * @param dataMartId DataMart ID
   * @param projectId Project ID
   * @param connectorName Connector name
   * @param definition Connector definition with merged secrets
   * @param userId Optional user ID
   * @returns Definition with secrets extracted and _secrets_id references added
   */
  async extractAndSaveSecrets(
    dataMartId: string,
    projectId: string,
    connectorName: string,
    definition: ConnectorDefinition,
    userId?: string
  ): Promise<ConnectorDefinition> {
    const secretFieldNames = await this.getAllSecretFieldNames(connectorName);

    // If no secrets in spec, return definition as-is
    if (secretFieldNames.size === 0) {
      return definition;
    }

    const processedConfiguration = await Promise.all(
      definition.connector.source.configuration.map(async item => {
        const configItem = JSON.parse(JSON.stringify(item)) as Record<string, unknown>;
        const configId = configItem._id as string;

        if (!configId) {
          return configItem;
        }

        // Skip items that use OAuth flow (they have _source_credential_id anywhere)
        // OAuth secrets are managed separately
        if (this.hasSourceCredentialIdRecursively(configItem)) {
          return configItem;
        }

        // Recursively extract secret values with their paths
        const secrets = this.extractSecretsRecursively(configItem, secretFieldNames);

        // If no secrets found, return as-is
        if (Object.keys(secrets).length === 0) {
          return configItem;
        }

        const existingSecretsId = configItem._secrets_id as string | undefined;

        if (existingSecretsId) {
          const existingSecrets =
            await this.connectorSourceCredentialsService.getCredentialsById(existingSecretsId);

          if (existingSecrets && existingSecrets.projectId !== projectId) {
            throw new Error(
              `Unauthorized: secrets ${existingSecretsId} do not belong to project ${projectId}`
            );
          }

          if (!existingSecrets) {
            const credentialsEntity =
              await this.connectorSourceCredentialsService.createSecretsForConfig(
                projectId,
                connectorName,
                dataMartId,
                configId,
                secrets,
                userId
              );
            configItem._secrets_id = credentialsEntity.id;
          } else {
            await this.connectorSourceCredentialsService.updateSecretsForConfig(
              existingSecretsId,
              projectId,
              secrets
            );
          }
        } else {
          // Create new secrets record
          const credentialsEntity =
            await this.connectorSourceCredentialsService.createSecretsForConfig(
              projectId,
              connectorName,
              dataMartId,
              configId,
              secrets,
              userId
            );
          configItem._secrets_id = credentialsEntity.id;
        }

        // Remove secret values from configuration (recursively)
        this.removeSecretsRecursively(configItem, secretFieldNames);

        return configItem;
      })
    );

    return {
      ...definition,
      connector: {
        ...definition.connector,
        source: {
          ...definition.connector.source,
          configuration: processedConfiguration,
        },
      },
    } as ConnectorDefinition;
  }

  /**
   * Recursively masks secret fields in an object, including nested oneOf fields.
   *
   * @param item Item to mask
   * @param secretFieldNames Set of secret field names
   * @returns Masked item
   */
  private maskRecursively(item: unknown, secretFieldNames: Set<string>): unknown {
    if (!item || typeof item !== 'object') {
      return item;
    }

    if (Array.isArray(item)) {
      return item.map(element => this.maskRecursively(element, secretFieldNames));
    }

    const maskedItem = { ...(item as Record<string, unknown>) };

    // If this item has _source_credential_id, don't mask OAuth-related fields
    // because the actual secrets are stored separately in ConnectorSourceCredentials
    const hasOAuthSecrets = maskedItem._source_credential_id !== undefined;

    // If this item has _secrets_id, secrets are already externalized
    // No need to mask - they're not in the definition
    const hasExternalizedSecrets = maskedItem._secrets_id !== undefined;

    for (const [key, value] of Object.entries(maskedItem)) {
      // Skip masking if this is the credential reference field itself
      if (key === '_source_credential_id' || key === '_secrets_id') {
        // Keep credential references as-is
        continue;
      }

      if (secretFieldNames.has(key)) {
        if (hasOAuthSecrets) {
          // OAuth secrets are stored separately, show mask to indicate value exists
          maskedItem[key] = SECRET_MASK;
        } else if (hasExternalizedSecrets) {
          // Secrets are externalized via _secrets_id
          // Show mask to indicate value exists in credentials table
          maskedItem[key] = SECRET_MASK;
        } else if (value !== undefined && value !== null && value !== '') {
          // Mask regular inline secrets that have values
          maskedItem[key] = SECRET_MASK;
        }
        // If value is empty/undefined and not externalized, leave it as-is
      } else if (value && typeof value === 'object') {
        maskedItem[key] = this.maskRecursively(value, secretFieldNames);
      }
    }

    return maskedItem;
  }

  /**
   * Recursively merges secret fields from previous configuration into incoming.
   *
   * @param incoming Incoming configuration object
   * @param previous Previous configuration object
   * @param secretFieldNames Set of secret field names
   * @returns Merged configuration object
   */
  private mergeSecretsRecursively(
    incoming: unknown,
    previous: unknown,
    secretFieldNames: Set<string>
  ): unknown {
    if (!incoming || typeof incoming !== 'object') {
      return incoming;
    }

    if (Array.isArray(incoming)) {
      return incoming.map((element, index) => {
        const prevElement = Array.isArray(previous) ? previous[index] : undefined;
        return this.mergeSecretsRecursively(element, prevElement, secretFieldNames);
      });
    }

    const incomingItem = { ...(incoming as Record<string, unknown>) };
    const previousItem = (previous && typeof previous === 'object' ? previous : {}) as Record<
      string,
      unknown
    >;

    for (const [key, value] of Object.entries(incomingItem)) {
      if (secretFieldNames.has(key)) {
        if (value === undefined || this.isSecretMask(value)) {
          if (previousItem[key] !== undefined) {
            incomingItem[key] = previousItem[key];
          }
        }
      } else if (value && typeof value === 'object') {
        incomingItem[key] = this.mergeSecretsRecursively(
          value,
          previousItem[key],
          secretFieldNames
        );
      }
    }

    for (const key of secretFieldNames) {
      if (!Object.prototype.hasOwnProperty.call(incomingItem, key)) {
        if (previousItem[key] !== undefined) {
          incomingItem[key] = previousItem[key];
        }
      }
    }

    return incomingItem;
  }

  /**
   * Masks all secret fields in the connector definition configuration.
   *
   * If the definition is absent or there are no secret fields in the
   * specification, returns the input as is.
   *
   * @param definition Connector definition to mask
   * @returns A new definition object with masked configuration or the original value
   */
  async mask(
    definition: ConnectorDefinition | undefined
  ): Promise<ConnectorDefinition | undefined> {
    if (!definition) return definition;

    const secretFieldNames = await this.getAllSecretFieldNames(definition.connector.source.name);
    if (secretFieldNames.size === 0) {
      return definition;
    }

    const secretsIds = definition.connector.source.configuration
      .map(item => (item as Record<string, unknown>)._secrets_id as string | undefined)
      .filter((id): id is string => !!id);

    const secretsMap = await this.connectorSourceCredentialsService.getCredentialsByIds(secretsIds);

    const maskedConfiguration = definition.connector.source.configuration.map(item => {
      const configItem = item as Record<string, unknown>;
      let maskedItem = this.maskRecursively(configItem, secretFieldNames) as Record<
        string,
        unknown
      >;

      const secretsId = configItem._secrets_id as string | undefined;
      if (secretsId) {
        const secretsEntity = secretsMap.get(secretsId);
        if (secretsEntity?.credentials) {
          maskedItem = JSON.parse(JSON.stringify(maskedItem)) as Record<string, unknown>;
          this.injectMasksAtPaths(maskedItem, secretsEntity.credentials);
        }
      }

      return maskedItem;
    });

    return {
      ...definition,
      connector: {
        ...definition.connector,
        source: {
          ...definition.connector.source,
          configuration: maskedConfiguration,
        },
      },
    } as ConnectorDefinition;
  }

  /**
   * Injects SECRET_MASK values at the paths specified by the secrets object.
   * Used to show masked values in UI for externalized secrets.
   *
   * @param obj Object to inject masks into (mutates in place)
   * @param secrets Object with path -> value pairs from credentials table
   */
  private injectMasksAtPaths(obj: Record<string, unknown>, secrets: Record<string, unknown>): void {
    for (const path of Object.keys(secrets)) {
      const parts = path.split('.');

      // Navigate to the parent object, creating intermediate objects if needed
      let current = obj;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current[part] || typeof current[part] !== 'object') {
          current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
      }

      // Set the masked value at the final key
      const lastPart = parts[parts.length - 1];
      current[lastPart] = SECRET_MASK;
    }
  }

  /**
   * Merges secret fields between the incoming and previous connector definitions.
   *
   * Rules per configuration item and each secret field:
   * - if a field is missing in the incoming item (omit-key) — use the previous value;
   * - if the incoming value equals {@link SECRET_MASK} — use the previous value;
   * - otherwise — keep the provided incoming value.
   *
   * If the incoming item has missing or empty `_id`, a new `_id` is generated and
   * merging with previous values is not performed for that item.
   *
   * If no previous item with the same `_id` is found, the incoming value is kept as is.
   *
   * If there are no secret fields in the specification — returns the incoming definition as is.
   *
   * If previous item has `_secrets_id`, loads secrets from the credentials table
   * and merges them with incoming values. The `_secrets_id` is preserved in the result.
   *
   * @param incoming New definition coming from the client
   * @param previous Previously stored definition used as a source of truth for secrets
   * @returns Definition with correctly merged secret values
   */
  async mergeDefinitionSecrets(
    incoming: ConnectorDefinition,
    previous: ConnectorDefinition | undefined
  ): Promise<ConnectorDefinition> {
    const secretFieldNames = await this.getAllSecretFieldNames(incoming.connector.source.name);
    const previousConfiguration = previous?.connector?.source?.configuration || [];

    const mergedConfiguration = await Promise.all(
      incoming.connector.source.configuration.map(async item => {
        const incomingItem = (item || {}) as Record<string, unknown>;

        const itemId = incomingItem._id;
        if (typeof itemId !== 'string' || itemId.length === 0) {
          incomingItem._id = randomUUID();
          return incomingItem;
        }

        const previousItem = previousConfiguration.find(prevItem => {
          const prevObj = (prevItem || {}) as Record<string, unknown>;
          return typeof prevObj._id === 'string' && prevObj._id === itemId;
        }) as Record<string, unknown> | undefined;

        if (!previousItem) {
          return incomingItem;
        }

        // If previous item has externalized secrets, load them for merging
        let previousWithSecrets = previousItem;
        const secretsId = previousItem._secrets_id as string | undefined;
        if (secretsId) {
          const secretsEntity =
            await this.connectorSourceCredentialsService.getCredentialsById(secretsId);
          if (secretsEntity) {
            // Clone previous item and inject secrets at their original paths
            previousWithSecrets = JSON.parse(JSON.stringify(previousItem)) as Record<
              string,
              unknown
            >;
            this.injectSecretsAtPaths(previousWithSecrets, secretsEntity.credentials);
          }
          // Preserve the _secrets_id reference
          incomingItem._secrets_id = secretsId;
        }

        return this.mergeSecretsRecursively(incomingItem, previousWithSecrets, secretFieldNames);
      })
    );

    return {
      ...incoming,
      connector: {
        ...incoming.connector,
        source: {
          ...incoming.connector.source,
          configuration: mergedConfiguration,
        },
      },
    } as ConnectorDefinition;
  }

  /**
   * Deletes secrets for configuration items that were removed from DataMart.
   *
   * This method compares the current configuration item IDs with the previous ones
   * and deletes secrets for items that no longer exist.
   *
   * @param dataMartId DataMart ID
   * @param currentConfigIds Set of current configuration item _ids
   * @param previousDefinition Previous connector definition (if exists)
   */
  async deleteOrphanedSecrets(
    dataMartId: string,
    currentConfigIds: Set<string>,
    previousDefinition: ConnectorDefinition | undefined
  ): Promise<void> {
    if (!previousDefinition) {
      return;
    }

    const previousConfigItems = previousDefinition.connector?.source?.configuration || [];

    // Find config items that existed before but are not in the current configuration
    const orphanedSecretsIds: string[] = [];

    for (const item of previousConfigItems) {
      const configItem = item as Record<string, unknown>;
      const configId = configItem._id as string | undefined;
      const secretsId = configItem._secrets_id as string | undefined;

      // If this config item had secrets and is no longer in the current configuration
      if (configId && secretsId && !currentConfigIds.has(configId)) {
        orphanedSecretsIds.push(secretsId);
      }
    }

    // Delete orphaned secrets
    for (const secretsId of orphanedSecretsIds) {
      await this.connectorSourceCredentialsService.deleteCredentials(secretsId);
    }
  }

  /**
   * Merges secret fields from source configurations into incoming definition.
   *
   * This method is used when copying configurations from an existing Data Mart.
   * Configuration items can be in one of two states:
   * 1. New copied configurations with `_copiedFrom.configId` metadata - secrets will be copied from source
   * 2. Existing configurations without `_copiedFrom` - secrets will be kept from previous version (self-copy scenario)
   *
   * Logic flow:
   * 1. Validates that both source and incoming definitions use the same connector type.
   *    Throws an error if connector types don't match to prevent incompatible secret merging.
   *
   * 2. Retrieves all secret field names from the connector specification to know which
   *    fields need to be merged.
   *
   * 3. Maps over each configuration item in the incoming definition:
   *    - If item has `_copiedFrom.configId` metadata:
   *      - Finds the corresponding source configuration by matching its _id
   *      - Recursively merges secret fields from that specific source configuration
   *      - Removes the `_copiedFrom` metadata field
   *      - Generates a new unique _id for the copied configuration
   *    - If item does NOT have `_copiedFrom` metadata (existing configuration):
   *      - Returns the item as is (will be handled by mergeDefinitionSecrets later)
   *
   * 4. Returns a new definition object with the same structure as incoming, but with
   *    configuration array containing items with properly merged secrets from their
   *    respective source configurations.
   *
   * @param incoming New definition coming from the client, may have mixed configurations (some with _copiedFrom, some without)
   * @param sourceDefinition Definition from the source Data Mart to copy secrets from
   * @returns Definition with correctly merged secret values from source configurations
   * @throws Error if connector types don't match
   * @throws Error if source configuration with specified _id is not found (when _copiedFrom is present)
   */
  async mergeDefinitionSecretsFromSource(
    incoming: ConnectorDefinition,
    sourceDefinition: ConnectorDefinition
  ): Promise<ConnectorDefinition> {
    if (incoming.connector.source.name !== sourceDefinition.connector.source.name) {
      throw new Error(
        `Cannot copy secrets from different connector type. ` +
          `Source: ${sourceDefinition.connector.source.name}, ` +
          `Target: ${incoming.connector.source.name}`
      );
    }

    const secretFieldNames = await this.getAllSecretFieldNames(incoming.connector.source.name);

    const mergedConfiguration = incoming.connector.source.configuration.map(incomingItem => {
      const itemWithMetadata = incomingItem as Record<string, unknown> & {
        _copiedFrom?: { configId: string };
      };

      if (!itemWithMetadata._copiedFrom?.configId) {
        return incomingItem;
      }

      const sourceConfigId = itemWithMetadata._copiedFrom.configId;

      const sourceConfig = sourceDefinition.connector.source.configuration.find(
        config => (config as Record<string, unknown> & { _id?: string })._id === sourceConfigId
      );

      if (!sourceConfig) {
        throw new Error(
          `Source configuration with _id "${sourceConfigId}" not found. ` +
            `Source has ${sourceDefinition.connector.source.configuration.length} configurations.`
        );
      }

      const mergedItem = this.mergeSecretsRecursively(
        incomingItem,
        sourceConfig,
        secretFieldNames
      ) as Record<string, unknown>;

      delete mergedItem._copiedFrom;
      mergedItem._id = randomUUID();

      return mergedItem;
    });

    return {
      ...incoming,
      connector: {
        ...incoming.connector,
        source: {
          ...incoming.connector.source,
          configuration: mergedConfiguration,
        },
      },
    } as ConnectorDefinition;
  }
}

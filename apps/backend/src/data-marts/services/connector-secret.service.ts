import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConnectorDefinition } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { ConnectorService } from './connector.service';
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
 * - merges secret fields during updates to avoid overwriting stored values with placeholders.
 */
export class ConnectorSecretService {
  constructor(private readonly connectorService: ConnectorService) {}

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

    for (const [key, value] of Object.entries(maskedItem)) {
      if (secretFieldNames.has(key)) {
        maskedItem[key] = SECRET_MASK;
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

    const maskedConfiguration = definition.connector.source.configuration.map(item =>
      this.maskRecursively(item, secretFieldNames)
    );

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

    const mergedConfiguration = incoming.connector.source.configuration.map(item => {
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

      return this.mergeSecretsRecursively(incomingItem, previousItem, secretFieldNames);
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

  /**
   * Merges secret fields from a specific source configuration into incoming definition.
   *
   * This method is used when copying configuration from an existing Data Mart.
   * It takes secrets from a specific configuration (by index) in the source definition
   * and merges them into the incoming definition's configurations.
   *
   * @param incoming New definition coming from the client
   * @param sourceDefinition Definition from the source Data Mart to copy secrets from
   * @param sourceConfigIndex Index of the configuration in source to use for secrets
   * @returns Definition with correctly merged secret values from source
   */
  async mergeDefinitionSecretsFromSource(
    incoming: ConnectorDefinition,
    sourceDefinition: ConnectorDefinition,
    sourceConfigIndex: number
  ): Promise<ConnectorDefinition> {
    if (incoming.connector.source.name !== sourceDefinition.connector.source.name) {
      throw new Error(
        `Cannot copy secrets from different connector type. ` +
          `Source: ${sourceDefinition.connector.source.name}, ` +
          `Target: ${incoming.connector.source.name}`
      );
    }

    if (
      sourceConfigIndex < 0 ||
      sourceConfigIndex >= sourceDefinition.connector.source.configuration.length
    ) {
      throw new Error(
        `Invalid source configuration index: ${sourceConfigIndex}. ` +
          `Source has ${sourceDefinition.connector.source.configuration.length} configurations.`
      );
    }

    const secretFieldNames = await this.getAllSecretFieldNames(incoming.connector.source.name);
    const sourceConfig = sourceDefinition.connector.source.configuration[sourceConfigIndex];

    const mergedConfiguration = incoming.connector.source.configuration.map(incomingItem => {
      return this.mergeSecretsRecursively(incomingItem, sourceConfig, secretFieldNames) as Record<
        string,
        unknown
      >;
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

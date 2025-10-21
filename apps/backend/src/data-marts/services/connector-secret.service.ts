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
   * Returns a set of field names that have the `SECRET` attribute in the
   * connector specification.
   *
   * @param connectorName Connector name
   * @returns Set of secret field names
   */
  private async getSecretFieldNames(connectorName: string): Promise<Set<string>> {
    const specification = await this.connectorService.getConnectorSpecification(connectorName);
    return new Set(
      specification
        .filter(field => (field.attributes || []).includes(Core.CONFIG_ATTRIBUTES.SECRET))
        .map(field => field.name)
    );
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

    const secretFieldNames = await this.getSecretFieldNames(definition.connector.source.name);
    if (secretFieldNames.size === 0) {
      return definition;
    }

    const maskedConfiguration = definition.connector.source.configuration.map(item => {
      const maskedItem = { ...(item as Record<string, unknown>) };
      for (const fieldName of secretFieldNames) {
        if (Object.prototype.hasOwnProperty.call(maskedItem, fieldName)) {
          maskedItem[fieldName] = SECRET_MASK;
        }
      }
      return maskedItem as Record<string, unknown>;
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
    const secretFieldNames = await this.getSecretFieldNames(incoming.connector.source.name);
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

      for (const fieldName of secretFieldNames) {
        if (
          !Object.prototype.hasOwnProperty.call(incomingItem, fieldName) ||
          this.isSecretMask(incomingItem[fieldName])
        ) {
          if (previousItem[fieldName] !== undefined) {
            incomingItem[fieldName] = previousItem[fieldName];
          }
        }
      }

      return incomingItem;
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

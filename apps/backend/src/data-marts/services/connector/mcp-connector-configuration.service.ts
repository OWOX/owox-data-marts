import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { deepEqual } from '../../../common/utils/deep-equal.util';
import type { ConnectorSpecificationItem } from '../../connector-types/connector-specification';
import { withoutKeyValues } from '../../connector-types/source-key-fields';
import { ConnectorService } from './connector.service';

const INVALID_CONFIGURATION =
  'Use only declared non-secret connector fields and saved Credential IDs';
const MAX_CONFIGURATION_BYTES = 120 * 1024;
const INTERNAL_CREDENTIAL_REFERENCES = new Set([
  '_secrets_id',
  '_source_credential_id',
  '_credential_id',
]);

/** Public connector settings for MCP reads and Credential-backed live previews. */
@Injectable()
export class McpConnectorConfigurationService {
  constructor(private readonly connectors: ConnectorService) {}

  async assertNonSecretConfiguration(
    projectId: string,
    connectorName: string,
    configuration: Record<string, unknown>,
    version?: number
  ): Promise<void> {
    try {
      const { schema } = await this.configurationSchema(projectId, connectorName, version);
      if (
        Buffer.byteLength(JSON.stringify(configuration), 'utf8') > MAX_CONFIGURATION_BYTES ||
        this.hasInternalReference(configuration, true) ||
        !schema.safeParse(configuration).success
      ) {
        throw new BadRequestException(INVALID_CONFIGURATION);
      }
    } catch {
      // Zod errors may contain user-provided values; keep them inside this boundary.
      throw new BadRequestException(INVALID_CONFIGURATION);
    }
  }

  async toPublicConfigurations(
    projectId: string,
    connectorName: string,
    configurations: Record<string, unknown>[],
    version?: number
  ): Promise<Record<string, unknown>[] | null> {
    if (configurations.length === 0) return [];
    try {
      const { schema, keyFields } = await this.configurationSchema(
        projectId,
        connectorName,
        version,
        false
      );
      const result: Record<string, unknown>[] = [];
      for (const configuration of configurations) {
        const parsed = schema.safeParse(withoutKeyValues(configuration, keyFields));
        // Do not return a partial public value when it contains an unsafe Credential reference.
        if (!parsed.success || this.hasInternalReference(parsed.data, true)) return null;
        result.push(parsed.data);
      }
      return result;
    } catch {
      // The caller can return setup metadata, but must omit the entire replacement definition.
    }
    return null;
  }

  private async configurationSchema(
    projectId: string,
    connectorName: string,
    version?: number,
    strict = true
  ) {
    const specification = await this.connectors.resolveConnectorSpecification(
      projectId,
      connectorName,
      version
    );
    const keys = await this.connectors.resolveSourceKeys(projectId, connectorName, version);
    const isCredentialField = (path: string[], name: string) =>
      keys.fields.some(field => deepEqual(field.path, path) && field.parameters.includes(name));
    const shape: Record<string, z.ZodType> = {};
    for (const field of specification) {
      if (field.attributes?.includes('SECRET') || isCredentialField([], field.name)) continue;
      if (field.oneOf?.length) {
        const variants: Record<string, z.ZodType> = {};
        for (const variant of field.oneOf) {
          if (variant.attributes?.includes('SECRET')) {
            // The public selector must survive a read/save; its values remain secret.
            variants[variant.value] = (strict ? z.object({}).strict() : z.object({})).optional();
            continue;
          }
          const items: Record<string, z.ZodType> = {};
          for (const [name, item] of Object.entries(variant.items)) {
            if (
              !item.attributes?.includes('SECRET') &&
              !isCredentialField([field.name, variant.value], name)
            )
              items[name] = (strict ? this.valueSchema(item) : z.json()).optional();
          }
          variants[variant.value] = (
            strict ? z.object(items).strict() : z.object(items)
          ).optional();
        }
        shape[field.name] = (
          strict
            ? z
                .object(variants)
                .strict()
                .refine(value => Object.keys(value).length <= 1)
            : z.object(variants)
        ).optional();
      } else {
        // Persisted definitions use connector runtime coercion (e.g. number strings).
        // Public output preserves declared JSON values, including runtime-coercible numbers.
        shape[field.name] = (strict ? this.valueSchema(field) : z.json()).optional();
      }
    }
    shape._id = z.string().min(1).max(255).optional();
    shape._credential_id = z.string().min(1).max(255).optional();
    return { schema: strict ? z.object(shape).strict() : z.object(shape), keyFields: keys.fields };
  }

  private valueSchema(field: ConnectorSpecificationItem): z.ZodType {
    switch (field.requiredType) {
      case 'string':
      case 'date':
        return z.string();
      case 'number':
        return z.union([
          z.number(),
          z.string().refine(value => value.trim() !== '' && Number.isFinite(Number(value))),
        ]);
      case 'boolean':
      case 'bool':
        return z.boolean();
      case 'array':
        return z.array(z.json());
      case 'object':
        return z.record(z.string(), z.json());
      default:
        return z.json();
    }
  }

  private hasInternalReference(value: unknown, root = false): boolean {
    if (Array.isArray(value)) return value.some(item => this.hasInternalReference(item));
    if (!value || typeof value !== 'object') return false;
    return Object.entries(value).some(
      ([key, child]) =>
        (INTERNAL_CREDENTIAL_REFERENCES.has(key) && !(root && key === '_credential_id')) ||
        this.hasInternalReference(child)
    );
  }
}

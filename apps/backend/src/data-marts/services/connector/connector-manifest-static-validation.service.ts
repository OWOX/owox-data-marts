import { Injectable } from '@nestjs/common';
import { Core } from '@owox/connectors';
import { z } from 'zod';
import type {
  ConnectorManifestIssueCode,
  ConnectorManifestIssueDto,
} from '../../dto/domain/mcp-custom-connectors.dto';
import {
  MAX_MANIFEST_SIZE_BYTES,
  MAX_TEXT_COLUMN_BYTES,
  MAX_VARCHAR_LENGTH,
} from '../../dto/presentation/custom-connector.dto';
import {
  fieldsSchemaFromManifest,
  specificationFromManifest,
} from './declarative-manifest-schemas';

const messages: Record<ConnectorManifestIssueCode, string> = {
  manifest_too_large: 'The UTF-8 serialized manifest exceeds 120 KiB.',
  metadata_too_large:
    'The manifest title, documentation URL or description exceeds its storage limit.',
  source_name_mismatch: 'The manifest must preserve the connector source name.',
  literal_auth_secret:
    'Authentication credentials must use Secret parameter references, not literal values.',
  secret_parameter_value: 'Secret parameters must not carry defaults, placeholders or options.',
  secret_parameter_required:
    'Declare authentication credential parameters explicitly with the SECRET attribute.',
  manifest_invalid:
    'The stored manifest fails runtime authoring validation. Inspect it in the application.',
  primary_key_required: 'Every node needs a primary key before publication.',
  runtime_schema_invalid:
    'The manifest cannot produce the required runtime parameter or node schema.',
};
const credentialKeys = new Set([
  'clientSecret',
  'refreshToken',
  'password',
  'token',
  'apiKey',
  'accessToken',
  'client_secret',
  'refresh_token',
  'access_token',
  'api_key',
]);
const credentialHeaderKeys = new Set([
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'api-key',
]);
const objectSchema = z.record(z.string(), z.unknown());
const secretReference = /^\{\{\s*parameters\.[A-Za-z][A-Za-z0-9_]*\s*\}\}$/;
const injectionReference =
  /^(?:Bearer |Basic )?\{\{\s*(?:parameters\.[A-Za-z][A-Za-z0-9_]*|auth\.token)\s*\}\}$/;
const record = (value: unknown): Record<string, unknown> | undefined => {
  const parsed = objectSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

/** Static checks never return manifest values, paths, parser errors or provider diagnostics. */
@Injectable()
export class ConnectorManifestStaticValidationService {
  validate(raw: unknown, sourceName: string): ConnectorManifestIssueDto[] {
    const manifest = record(raw);
    if (!manifest) return [{ code: 'manifest_invalid', message: messages.manifest_invalid }];
    const issues = new Set<ConnectorManifestIssueCode>();
    if (Buffer.byteLength(JSON.stringify(manifest), 'utf8') > MAX_MANIFEST_SIZE_BYTES) {
      return [{ code: 'manifest_too_large', message: messages.manifest_too_large }];
    }
    if (manifest.name !== sourceName) issues.add('source_name_mismatch');
    if (
      ['title', 'docUrl', 'description'].some(key => {
        const value = manifest[key];
        return (
          typeof value === 'string' &&
          value.trim() !== '' &&
          (key === 'description'
            ? Buffer.byteLength(value, 'utf8') > MAX_TEXT_COLUMN_BYTES
            : value.length > MAX_VARCHAR_LENGTH)
        );
      })
    )
      issues.add('metadata_too_large');
    if (
      this.hasLiteralAuthentication(manifest.authentication) ||
      this.hasLiteralRequestCredentials(manifest.nodes)
    ) {
      issues.add('literal_auth_secret');
    }
    if (this.hasSecretValues(manifest.parameters)) issues.add('secret_parameter_value');
    try {
      const model = new Core.ManifestParser().parse(JSON.stringify(manifest), { authoring: true });
      if (
        model.autoSecretAuthParameters?.length ||
        model.undeclaredAuthParameters?.length ||
        model.unprotectedRequestParameters?.length
      ) {
        issues.add('secret_parameter_required');
      }
      if (this.hasSecretValues(model.parameters)) issues.add('secret_parameter_value');
      const nodes = record(manifest.nodes) ?? {};
      if (
        Object.values(nodes).some(
          node =>
            !Array.isArray(record(node)?.uniqueKeys) ||
            !(record(node)?.uniqueKeys as unknown[]).length
        )
      ) {
        issues.add('primary_key_required');
      }
      try {
        specificationFromManifest(manifest);
        fieldsSchemaFromManifest(manifest);
      } catch {
        issues.add('runtime_schema_invalid');
      }
    } catch {
      issues.add('manifest_invalid');
    }
    return [...issues].map(code => ({ code, message: messages[code] }));
  }

  /** App classification never overrides explicit credential-position rules. */
  hasUnprotectedKnownSecrets(manifest: Record<string, unknown>): boolean {
    const protectedReference = (value: unknown) =>
      !!value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === 1 &&
      typeof (value as Record<string, unknown>).$protected === 'string';
    const safe = (value: unknown): unknown => {
      if (protectedReference(value)) return '{{parameters.ProtectedValue}}';
      if (Array.isArray(value)) return value.map(safe);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(
        Object.entries(value)
          .filter(
            ([key, child]) =>
              !(['default', 'placeholder', 'options'].includes(key) && protectedReference(child))
          )
          .map(([key, child]) => [key, safe(child)])
      );
    };
    const checked = safe(manifest) as Record<string, unknown>;
    return (
      this.hasLiteralAuthentication(checked.authentication) ||
      this.hasLiteralRequestCredentials(checked.nodes) ||
      this.hasSecretValues(checked.parameters)
    );
  }

  private hasSecretValues(parameters: unknown): boolean {
    return Object.values(record(parameters) ?? {}).some(raw => {
      const field = record(raw);
      if (!field) return false;
      if (
        Array.isArray(field.attributes) &&
        field.attributes.includes('SECRET') &&
        ['default', 'placeholder', 'options'].some(key => field[key] !== undefined)
      )
        return true;
      return (
        Array.isArray(field.oneOf) &&
        field.oneOf.some(branch => this.hasSecretValues(record(branch)?.items))
      );
    });
  }

  /** Explicit known credential positions only; this does not certify arbitrary JSON as safe to edit. */
  private hasLiteralAuthentication(raw: unknown): boolean {
    const auth = record(raw);
    if (!auth) return false;
    return Object.entries(auth).some(([key, value]) => {
      if (key === 'username' && auth.type === 'basic' && !auth.password)
        return this.hasLiteralSecret(value);
      if (key === 'authenticators')
        return Object.values(record(value) ?? {}).some(branch =>
          this.hasLiteralAuthentication(branch)
        );
      if (key === 'inject') {
        const format = record(value)?.format;
        return (
          format !== undefined && (typeof format !== 'string' || !injectionReference.test(format))
        );
      }
      if (key === 'exchange') return this.hasLiteralCredentialField(value);
      return credentialKeys.has(key) && this.hasLiteralSecret(value);
    });
  }

  private hasLiteralRequestCredentials(nodes: unknown): boolean {
    return Object.values(record(nodes) ?? {}).some(raw => {
      const node = record(raw);
      const retriever = record(node?.retriever);
      const parent = record(record(node?.partitionRouter)?.parent);
      return [node?.request, retriever?.submit, retriever?.poll, parent?.request].some(request =>
        ['headers', 'queryParameters', 'body'].some(key =>
          this.hasLiteralCredentialField(record(request)?.[key])
        )
      );
    });
  }

  private hasLiteralCredentialField(value: unknown): boolean {
    return Object.entries(record(value) ?? {}).some(([key, item]) => {
      if (credentialHeaderKeys.has(key.toLowerCase())) {
        return typeof item !== 'string' || !injectionReference.test(item);
      }
      if (credentialKeys.has(key)) return this.hasLiteralSecret(item);
      return Array.isArray(item)
        ? item.some(child => this.hasLiteralCredentialField(child))
        : this.hasLiteralCredentialField(item);
    });
  }

  private hasLiteralSecret(value: unknown): boolean {
    if (value === null || value === undefined || value === '') return false;
    if (typeof value === 'string') return !secretReference.test(value);
    if (Array.isArray(value)) return value.some(item => this.hasLiteralSecret(item));
    if (typeof value === 'object')
      return Object.values(value).some(item => this.hasLiteralSecret(item));
    return true;
  }
}

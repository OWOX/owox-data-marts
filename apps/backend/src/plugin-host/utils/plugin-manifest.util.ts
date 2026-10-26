import { castError } from '@owox/internal-helpers';
import { z } from 'zod';
import { BUILTIN_CREDENTIAL_DEFINITION_IDS } from '../../data-marts/credentials/services/builtin-credential-definitions';
import { CredentialExternalDefinitionRegistryService } from '../../data-marts/credentials/services/credential-external-definition-registry.service';
import { PLUGIN_ACTION_LIMITS } from '../constants/plugin-action-limits';
import { ReleaseRejectionCode } from '../enums/release-rejection-code.enum';
import { assertBoundedSchema } from './action-input-schema.util';

export const PluginCollectionEntityTypeSchema = z.enum([
  'data-mart',
  'storage',
  'destination',
  'report',
]);

export const PluginCollectionActionSchema = z.enum([
  'SEE',
  'USE',
  'EDIT',
  'DELETE',
  'CONFIGURE_SHARING',
  'MANAGE_OWNERS',
  'MANAGE_TRIGGERS',
  'COPY_CREDENTIALS',
  'RUN',
]);

const PluginCollectionDeclarationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine(name => name !== '.' && name !== '..', 'collection name cannot be . or ..'),
  scope: z.enum(['project', 'member']),
  entityBinding: z
    .object({
      type: PluginCollectionEntityTypeSchema,
      actions: z.object({
        read: PluginCollectionActionSchema,
        create: PluginCollectionActionSchema,
        update: PluginCollectionActionSchema,
        delete: PluginCollectionActionSchema,
      }),
    })
    .optional(),
});

export const PluginCredentialRequirementSchema = z.union([
  z.string().trim().min(1).max(255),
  z.object({
    id: z.string().trim().min(1).max(255),
    optional: z.boolean().default(false),
    models: z.array(z.string().trim().min(1).max(255)).max(20).optional(),
    scopes: z.array(z.string().min(1).max(200).regex(/^\S+$/)).min(1).max(20).optional(),
  }),
]);

export type PluginCredentialRequirement = z.infer<typeof PluginCredentialRequirementSchema>;

export const PLUGIN_ACTION_NAME_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

/** `url` is absolute https or relative to `delivery.url`; the manifest schema checks which. */
export const PluginBackendSchema = z.object({
  url: z.string().min(1).max(2048),
  actions: z
    .record(
      z
        .string()
        .regex(
          PLUGIN_ACTION_NAME_PATTERN,
          'action names are lower-case letters, digits and hyphens, start with a letter, and have at most 64 characters'
        ),
      z.object({
        timeoutSeconds: z.number().int().min(1).max(300).default(30),
        input: z.record(z.unknown()).optional(),
      })
    )
    .refine(actions => Object.keys(actions).length >= 1, 'declare at least one action')
    .refine(
      actions => Object.keys(actions).length <= PLUGIN_ACTION_LIMITS.maxActions,
      `at most ${PLUGIN_ACTION_LIMITS.maxActions} actions`
    ),
});

export type PluginBackendDeclaration = z.infer<typeof PluginBackendSchema>;
export type PluginBackendActionDeclaration = PluginBackendDeclaration['actions'][string];

const ENTITY_ACTIONS: Record<
  z.infer<typeof PluginCollectionEntityTypeSchema>,
  ReadonlySet<string>
> = {
  'data-mart': new Set([
    'SEE',
    'USE',
    'EDIT',
    'DELETE',
    'CONFIGURE_SHARING',
    'MANAGE_OWNERS',
    'MANAGE_TRIGGERS',
  ]),
  storage: new Set([
    'SEE',
    'USE',
    'EDIT',
    'DELETE',
    'CONFIGURE_SHARING',
    'MANAGE_OWNERS',
    'COPY_CREDENTIALS',
  ]),
  destination: new Set([
    'SEE',
    'USE',
    'EDIT',
    'DELETE',
    'CONFIGURE_SHARING',
    'MANAGE_OWNERS',
    'COPY_CREDENTIALS',
  ]),
  report: new Set(['SEE', 'EDIT', 'DELETE', 'RUN']),
};

export type PluginCollectionDeclaration = z.infer<typeof PluginCollectionDeclarationSchema>;

/**
 * `plugin.json` v1, exactly as the specification defines it.
 *
 * There is deliberately no `id`, `version` or `manifestVersion`: repository identity
 * comes from GitHub's stable numeric repo id, and the version comes from the Release
 * tag. Unknown keys are stripped rather than rejected so a manifest written for a
 * later schema still parses.
 */
export const PluginManifestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(2000),
    delivery: z.object({
      type: z.literal('remote'),
      url: z.string().url().startsWith('https://'),
    }),
    collections: z.array(PluginCollectionDeclarationSchema).max(50).default([]),
    credentials: z.array(PluginCredentialRequirementSchema).max(50).default([]),
    backend: PluginBackendSchema.optional(),
  })
  .superRefine((manifest, context) => {
    const names = new Set<string>();
    for (const [index, collection] of manifest.collections.entries()) {
      if (names.has(collection.name)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['collections', index, 'name'],
          message: `duplicate collection name "${collection.name}"`,
        });
      }
      names.add(collection.name);
      if (collection.entityBinding) {
        const allowed = ENTITY_ACTIONS[collection.entityBinding.type];
        for (const [operation, action] of Object.entries(collection.entityBinding.actions)) {
          if (!allowed.has(action)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['collections', index, 'entityBinding', 'actions', operation],
              message: `${action} is not supported for ${collection.entityBinding.type}`,
            });
          }
        }
      }
    }

    const credentialKeys = new Set<string>();
    for (const [index, requirement] of manifest.credentials.entries()) {
      const key = typeof requirement === 'string' ? requirement : requirement.id;
      if (key !== 'ai' && !key.startsWith('@') && !BUILTIN_CREDENTIAL_DEFINITION_IDS.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path:
            typeof requirement === 'string' ? ['credentials', index] : ['credentials', index, 'id'],
          message: `unknown Credential requirement "${key}"; use ai, a built-in definition, or @owner/repository`,
        });
      }
      if (credentialKeys.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['credentials', index],
          message: `duplicate credential requirement "${key}"`,
        });
      }
      if (!CredentialExternalDefinitionRegistryService.isPluginRequestable(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path:
            typeof requirement === 'string' ? ['credentials', index] : ['credentials', index, 'id'],
          message: `Credential definition "${key}" cannot be required by a plugin`,
        });
      }
      credentialKeys.add(key);
      if (key === 'ai' && typeof requirement !== 'string' && requirement.models !== undefined) {
        if (requirement.models.length === 0) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['credentials', index, 'models'],
            message: 'logical ai models must contain at least one model',
          });
        }
        if (new Set(requirement.models).size !== requirement.models.length) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['credentials', index, 'models'],
            message: 'logical ai models must be unique',
          });
        }
        if (requirement.models.some(model => !['fast', 'reasoning', 'embedding'].includes(model))) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['credentials', index, 'models'],
            message: 'ai models must be fast, reasoning, or embedding',
          });
        }
      }
      if (key !== 'ai' && typeof requirement !== 'string' && requirement.models?.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['credentials', index, 'models'],
          message: 'models are supported only for the logical ai requirement',
        });
      }
      const scopes = typeof requirement === 'string' ? undefined : requirement.scopes;
      if (key === 'google-service-account' && !scopes) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['credentials', index],
          message: 'google-service-account requires scopes',
        });
      }
      if (key !== 'google-service-account' && scopes) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['credentials', index, 'scopes'],
          message: 'scopes are supported only for google-service-account',
        });
      }
      if (scopes && new Set(scopes).size !== scopes.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['credentials', index, 'scopes'],
          message: 'scopes must be unique',
        });
      }
    }

    if (manifest.backend) {
      const problem = findBackendUrlProblem(manifest.backend.url, manifest.delivery.url);
      if (problem) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['backend', 'url'],
          message: problem,
        });
      }
    }
  });

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

export type ManifestParseResult =
  | { readonly ok: true; readonly manifest: PluginManifest }
  | { readonly ok: false; readonly code: ReleaseRejectionCode; readonly detail: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseUrl(value: string, base?: string): URL | null {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

/** `//host/x` and `\\host` look relative but leave the delivery origin, so the origin is compared. */
function findBackendUrlProblem(url: string, deliveryUrl: string): string | null {
  const absolute = /^[a-z][a-z0-9+.-]*:/i.test(url);
  if (absolute && !(url.startsWith('https://') && parseUrl(url))) {
    return 'an absolute URL must use https';
  }
  const delivery = parseUrl(deliveryUrl);
  // An unparsable delivery.url carries its own issue.
  if (!delivery) return null;
  const resolved = parseUrl(url, deliveryUrl);
  if (!absolute && resolved?.origin !== delivery.origin) {
    return 'a relative URL must stay on the delivery.url origin';
  }
  // fetch refuses a URL with credentials, so every dispatch would fail.
  return resolved?.username || resolved?.password
    ? 'the URL must not contain a user name or password'
    : null;
}

/** Each declared input schema, with the manifest path a refusal names. */
export function listActionInputSchemas(
  backend: PluginBackendDeclaration | null | undefined
): { readonly path: string; readonly schema: Record<string, unknown> }[] {
  return Object.entries(backend?.actions ?? {}).flatMap(([name, action]) =>
    action.input ? [{ path: `backend.actions.${name}.input`, schema: action.input }] : []
  );
}

/** A publisher's schema runs on every invocation, so it must stay small; the pool compiles it later. */
function findUnsupportedActionInput(backend: PluginBackendDeclaration | undefined): string | null {
  for (const { path, schema } of listActionInputSchemas(backend)) {
    try {
      if (Buffer.byteLength(JSON.stringify(schema)) > PLUGIN_ACTION_LIMITS.maxInputSchemaBytes) {
        return `${path}: exceeds ${PLUGIN_ACTION_LIMITS.maxInputSchemaBytes / 1024} KiB`;
      }
      assertBoundedSchema(schema);
    } catch (error) {
      return `${path}: ${castError(error).message}`;
    }
  }
  return null;
}

/**
 * Pure, and never throws: a broken manifest is one ineligible Release, not a failed sync.
 *
 * @param rawFileContent contents of plugin.json at the release commit, or null when absent.
 */
export function parsePluginManifest(rawFileContent: string | null): ManifestParseResult {
  if (rawFileContent === null) {
    return {
      ok: false,
      code: ReleaseRejectionCode.MANIFEST_MISSING,
      detail: 'plugin.json was not found at the repository root for this commit',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawFileContent);
  } catch (error) {
    return {
      ok: false,
      code: ReleaseRejectionCode.MANIFEST_INVALID_JSON,
      detail: error instanceof Error ? error.message : 'plugin.json is not valid JSON',
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      code: ReleaseRejectionCode.MANIFEST_INVALID_JSON,
      detail: 'plugin.json must contain a JSON object',
    };
  }

  // Reported separately from a generic schema error: "only remote delivery is
  // supported today" tells a publisher what to do, "invalid literal" does not.
  const delivery = parsed.delivery;
  if (isRecord(delivery) && typeof delivery.type === 'string' && delivery.type !== 'remote') {
    return {
      ok: false,
      code: ReleaseRejectionCode.DELIVERY_UNSUPPORTED,
      detail: `Unsupported delivery.type "${delivery.type}"; only "remote" is supported`,
    };
  }

  const result = PluginManifestSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      code: ReleaseRejectionCode.MANIFEST_SCHEMA,
      detail: result.error.issues
        .map(issue => `${issue.path.join('.') || 'manifest'}: ${issue.message}`)
        .join('; '),
    };
  }

  const unsupportedInput = findUnsupportedActionInput(result.data.backend);
  if (unsupportedInput) {
    return {
      ok: false,
      code: ReleaseRejectionCode.ACTION_INPUT_UNSUPPORTED,
      detail: unsupportedInput,
    };
  }

  return { ok: true, manifest: result.data };
}

/**
 * A new current version may add collections and may change their action map, but it
 * cannot remove or structurally redefine a collection that already owns data.
 *
 * The sync applies this only within the released major line: a major version bump is
 * the publisher's declared breaking change, so the check is waived there.
 */
export function findIncompatibleCollectionChange(
  current: readonly PluginCollectionDeclaration[],
  candidate: readonly PluginCollectionDeclaration[]
): string | null {
  const candidateByName = new Map(candidate.map(collection => [collection.name, collection]));

  for (const existing of current) {
    const next = candidateByName.get(existing.name);
    if (!next) {
      return `Collection "${existing.name}" cannot be removed`;
    }
    if (next.scope !== existing.scope) {
      return `Collection "${existing.name}" cannot change scope`;
    }

    const existingType = existing.entityBinding?.type ?? null;
    const nextType = next.entityBinding?.type ?? null;
    if (existingType !== nextType) {
      return `Collection "${existing.name}" cannot change entity binding`;
    }
  }

  return null;
}

/** The only place a backend URL is resolved: it is stored as declared, so a relative one follows delivery.url. */
export function resolveBackendUrl(backend: PluginBackendDeclaration, deliveryUrl: string): string {
  return new URL(backend.url, deliveryUrl).toString();
}

/** A release may add actions and change their url, timeout and input, but not remove one: schedules refer to actions by name. */
export function findIncompatibleActionChange(
  current: PluginBackendDeclaration | null | undefined,
  candidate: PluginBackendDeclaration | null | undefined
): string | null {
  const next = candidate?.actions ?? {};
  const removed = Object.keys(current?.actions ?? {}).find(name => !Object.hasOwn(next, name));
  return removed === undefined ? null : `Action "${removed}" cannot be removed`;
}

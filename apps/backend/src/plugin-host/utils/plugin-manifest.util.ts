import { z } from 'zod';
import { ReleaseRejectionCode } from '../enums/release-rejection-code.enum';

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
  });

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

export type ManifestParseResult =
  | { readonly ok: true; readonly manifest: PluginManifest }
  | { readonly ok: false; readonly code: ReleaseRejectionCode; readonly detail: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

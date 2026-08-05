import { z } from 'zod';
import { ReleaseRejectionCode } from '../enums/release-rejection-code.enum';

/**
 * `plugin.json` v1, exactly as the specification defines it.
 *
 * There is deliberately no `id`, `version` or `manifestVersion`: repository identity
 * comes from GitHub's stable numeric repo id, and the version comes from the Release
 * tag. Unknown keys are stripped rather than rejected so a manifest written for a
 * later schema still parses.
 */
export const PluginManifestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  delivery: z.object({
    type: z.literal('remote'),
    url: z.string().url().startsWith('https://'),
  }),
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

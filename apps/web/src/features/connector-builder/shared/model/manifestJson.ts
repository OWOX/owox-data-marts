import type { BuilderManifest, ManifestNode, ManifestParameter } from './manifest.types';

export type ParseManifestResult =
  | { ok: true; manifest: BuilderManifest }
  | { ok: false; error: string };

export function manifestToJson(manifest: BuilderManifest): string {
  return JSON.stringify(manifest, null, 2);
}

/** The authentication types the engine runs, and so the ones the form can show. */
const AUTH_TYPES = new Set(['apiKey', 'basic', 'bearer', 'tokenExchange', 'oauth2', 'selective']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseManifestJson(text: string): ParseManifestResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, error: 'Manifest must be a JSON object' };
  }
  if (parsed.parameters !== undefined && !isPlainObject(parsed.parameters)) {
    return { ok: false, error: '"parameters" must be an object' };
  }
  if (parsed.nodes !== undefined && !isPlainObject(parsed.nodes)) {
    return { ok: false, error: '"nodes" must be an object' };
  }
  // The form reads each of these as an object, and one that is not took the whole builder
  // down; Code mode and Import are where such a manifest comes from.
  for (const [name, parameter] of Object.entries(parsed.parameters ?? {})) {
    if (!isPlainObject(parameter)) {
      return { ok: false, error: `parameter "${name}" must be an object` };
    }
  }
  for (const [name, node] of Object.entries(parsed.nodes ?? {})) {
    if (!isPlainObject(node)) return { ok: false, error: `node "${name}" must be an object` };
  }
  const auth = parsed.authentication;
  if (auth !== undefined && auth !== null) {
    const type = isPlainObject(auth) ? auth.type : undefined;
    if (typeof type !== 'string' || !AUTH_TYPES.has(type)) {
      return {
        ok: false,
        error:
          `"authentication.type" must be one of ${[...AUTH_TYPES].join(', ')}` +
          (typeof type === 'string' ? `, not "${type}"` : ''),
      };
    }
  }
  const manifest = {
    version: '1.0',
    name: '',
    baseUrl: '',
    ...parsed,
    parameters: (parsed.parameters as Record<string, ManifestParameter> | undefined) ?? {},
    nodes: (parsed.nodes as Record<string, ManifestNode> | undefined) ?? {},
  } as BuilderManifest;
  return { ok: true, manifest };
}

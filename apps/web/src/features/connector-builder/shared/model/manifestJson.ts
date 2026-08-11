import type { BuilderManifest, ManifestNode, ManifestParameter } from './manifest.types';

export type ParseManifestResult =
  | { ok: true; manifest: BuilderManifest }
  | { ok: false; error: string };

export function manifestToJson(manifest: BuilderManifest): string {
  return JSON.stringify(manifest, null, 2);
}

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

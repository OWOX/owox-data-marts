import { describe, it, expect } from 'vitest';
import { manifestToJson, parseManifestJson } from './manifestJson';
import {
  createEmptyManifest,
  createEmptyNode,
  createDefaultAuthentication,
} from './manifest.types';

describe('manifestJson', () => {
  it('serializes to pretty JSON and round-trips', () => {
    const m = createEmptyManifest();
    m.name = 'MyApi';
    m.nodes.items = createEmptyNode();
    const json = manifestToJson(m);
    expect(json).toContain('\n  '); // 2-space pretty print
    const res = parseManifestJson(json);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.manifest).toEqual(m);
  });

  it('rejects malformed JSON', () => {
    expect(parseManifestJson('{ not json').ok).toBe(false);
  });

  it('rejects a non-object root', () => {
    expect(parseManifestJson('42').ok).toBe(false);
    expect(parseManifestJson('"x"').ok).toBe(false);
    expect(parseManifestJson('[]').ok).toBe(false);
    expect(parseManifestJson('null').ok).toBe(false);
  });

  it('normalizes missing top-level keys to safe defaults', () => {
    const res = parseManifestJson('{"name":"X"}');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.manifest.name).toBe('X');
      expect(res.manifest.version).toBe('1.0');
      expect(res.manifest.baseUrl).toBe('');
      expect(res.manifest.parameters).toEqual({});
      expect(res.manifest.nodes).toEqual({});
    }
  });

  it('rejects when nodes or parameters are present but not objects', () => {
    expect(parseManifestJson('{"nodes":[]}').ok).toBe(false);
    expect(parseManifestJson('{"parameters":"x"}').ok).toBe(false);
  });

  it('preserves authentication and optional string fields through the round-trip', () => {
    const m = createEmptyManifest();
    m.title = 'My API';
    m.authentication = createDefaultAuthentication('apiKey');
    const res = parseManifestJson(manifestToJson(m));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.manifest).toEqual(m);
  });
});

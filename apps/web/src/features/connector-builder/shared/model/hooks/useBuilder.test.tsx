import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useBuilder } from './useBuilder';
import { BuilderProvider } from '../context/BuilderProvider';
import { createEmptyManifest, type BuilderManifest, type ManifestNode } from '../manifest.types';

/** A node with content at two levels, so a clone can be checked for a shared sub-object
 * (a shallow `{...src}` copy would still pass a top-level reference check). */
function node(path: string): ManifestNode {
  return {
    request: { method: 'GET', path, queryParameters: { limit: '100' } },
    recordSelector: { recordPath: ['data', 'items'] },
    fields: { id: { type: 'string' } },
  };
}

function manifestWith(nodes: Record<string, ManifestNode>): BuilderManifest {
  return { ...createEmptyManifest(), name: 'MyApi', nodes };
}

/** Drive the real hook over the real reducer through `BuilderProvider`. The provider always
 * starts from an empty manifest, so each test seeds its nodes with `setManifest` first. */
function renderBuilder(nodes: Record<string, ManifestNode>) {
  const rendered = renderHook(() => useBuilder(), { wrapper: BuilderProvider });
  act(() => {
    rendered.result.current.setManifest(manifestWith(nodes));
  });
  return rendered;
}

describe('useBuilder cloneNode', () => {
  it('skips names already taken and returns the suffixed name it used', () => {
    const { result } = renderBuilder({ items: node('/items'), items_copy: node('/copy') });

    let created: string | null = null;
    act(() => {
      created = result.current.cloneNode('items');
    });

    expect(created).toBe('items_copy_2');
    expect(Object.keys(result.current.manifest.nodes)).toEqual([
      'items',
      'items_copy',
      'items_copy_2',
    ]);
  });

  it('deep-clones the source node rather than aliasing it', () => {
    const { result } = renderBuilder({ items: node('/items'), items_copy: node('/copy') });
    act(() => {
      result.current.cloneNode('items');
    });

    const { items, items_copy_2 } = result.current.manifest.nodes;
    expect(items_copy_2).toEqual(items);
    expect(items_copy_2).not.toBe(items);
    // Nested objects must be copies too, or editing the clone would edit the original.
    expect(items_copy_2.request).not.toBe(items.request);
    expect(items_copy_2.recordSelector).not.toBe(items.recordSelector);
    expect(items_copy_2.fields).not.toBe(items.fields);
  });

  it('returns null and changes nothing for a node that does not exist', () => {
    const { result } = renderBuilder({ items: node('/items') });

    let created: string | null = 'unset';
    act(() => {
      created = result.current.cloneNode('missing');
    });

    expect(created).toBeNull();
    expect(Object.keys(result.current.manifest.nodes)).toEqual(['items']);
  });
});

describe('useBuilder renameNode', () => {
  it('renames in place, preserving the order of the surrounding nodes', () => {
    const { result } = renderBuilder({ a: node('/a'), b: node('/b'), c: node('/c') });

    let renamed: string | null = null;
    act(() => {
      renamed = result.current.renameNode('b', 'z');
    });

    expect(renamed).toBe('z');
    // The manual map rebuild exists for exactly this: the renamed node keeps its slot
    // instead of jumping to the end, which is what the nav rail shows.
    expect(Object.keys(result.current.manifest.nodes)).toEqual(['a', 'z', 'c']);
    expect(result.current.manifest.nodes.z).toEqual(node('/b'));
  });

  it('trims the new name before using it', () => {
    const { result } = renderBuilder({ a: node('/a'), b: node('/b') });

    let renamed: string | null = null;
    act(() => {
      renamed = result.current.renameNode('b', '  z  ');
    });

    expect(renamed).toBe('z');
    expect(Object.keys(result.current.manifest.nodes)).toEqual(['a', 'z']);
  });

  it('returns null for a blank name and leaves the nodes untouched', () => {
    const { result } = renderBuilder({ a: node('/a'), b: node('/b'), c: node('/c') });

    let renamed: string | null = 'unset';
    act(() => {
      renamed = result.current.renameNode('b', '  ');
    });

    expect(renamed).toBeNull();
    expect(Object.keys(result.current.manifest.nodes)).toEqual(['a', 'b', 'c']);
  });

  it('returns null when the target name already exists, so no node is overwritten', () => {
    const { result } = renderBuilder({ a: node('/a'), b: node('/b'), c: node('/c') });

    let renamed: string | null = 'unset';
    act(() => {
      renamed = result.current.renameNode('b', 'c');
    });

    expect(renamed).toBeNull();
    expect(Object.keys(result.current.manifest.nodes)).toEqual(['a', 'b', 'c']);
    expect(result.current.manifest.nodes.c).toEqual(node('/c'));
  });

  it('returns null when the source node does not exist', () => {
    const { result } = renderBuilder({ a: node('/a'), b: node('/b') });

    let renamed: string | null = 'unset';
    act(() => {
      renamed = result.current.renameNode('missing', 'z');
    });

    expect(renamed).toBeNull();
    expect(Object.keys(result.current.manifest.nodes)).toEqual(['a', 'b']);
  });

  it('returns null when the name is unchanged', () => {
    const { result } = renderBuilder({ a: node('/a'), b: node('/b') });

    let renamed: string | null = 'unset';
    act(() => {
      renamed = result.current.renameNode('b', 'b');
    });

    expect(renamed).toBeNull();
    expect(Object.keys(result.current.manifest.nodes)).toEqual(['a', 'b']);
  });
});

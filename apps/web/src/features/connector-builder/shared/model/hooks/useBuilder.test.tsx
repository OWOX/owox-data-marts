import { afterEach, describe, it, expect, vi } from 'vitest';
import { toast } from 'react-hot-toast';
import { ConnectorBuilderApiService } from '../../api/connector-builder-api.service';
import { act, renderHook } from '@testing-library/react';
import { useBuilder } from './useBuilder';
import { BuilderProvider } from '../context/BuilderProvider';
import { createEmptyManifest, type BuilderManifest, type ManifestNode } from '../manifest.types';

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { toast, default: toast };
});

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

describe('useBuilder publish report', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(toast).mockClear();
  });

  const detail = {
    id: 'def-1',
    name: 'MyApi',
    title: 'MyApi',
    description: null,
    logo: null,
    docUrl: null,
    activeVersionId: null,
    versions: [{ version: 1, status: 'published' as const, publishedAt: null }],
  };

  const publishWith = async (report: {
    stoppingDataMarts: { id: string; title: string }[];
    hiddenStoppingCount: number;
  }) => {
    vi.spyOn(ConnectorBuilderApiService.prototype, 'create').mockResolvedValue({
      id: 'def-1',
      name: 'MyApi',
      title: 'MyApi',
    });
    vi.spyOn(ConnectorBuilderApiService.prototype, 'getById').mockResolvedValue(detail);
    vi.spyOn(ConnectorBuilderApiService.prototype, 'publish').mockResolvedValue({
      version: 1,
      status: 'published',
      publishedAt: null,
      warnings: [],
      ...report,
    });
    const rendered = renderBuilder({ items: node('/items') });
    await act(async () => {
      await rendered.result.current.publish();
    });
    return rendered;
  };

  it('publish shows the Data Marts that will stop', async () => {
    await publishWith({
      stoppingDataMarts: [
        { id: 'a', title: 'Sales' },
        { id: 'b', title: 'Ads' },
      ],
      hiddenStoppingCount: 2,
    });
    expect(toast).toHaveBeenCalledWith(
      'These Data Marts stop until a fitting Credential is selected: Sales, Ads and 2 more',
      expect.anything()
    );
  });

  it('lists the first five titles and counts the rest with the hidden ones', async () => {
    await publishWith({
      stoppingDataMarts: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(title => ({ id: title, title })),
      hiddenStoppingCount: 1,
    });
    expect(toast).toHaveBeenCalledWith(
      'These Data Marts stop until a fitting Credential is selected: A, B, C, D, E and 3 more',
      expect.anything()
    );
  });

  it('shows only the count when every stopping Data Mart is hidden', async () => {
    await publishWith({ stoppingDataMarts: [], hiddenStoppingCount: 3 });
    expect(toast).toHaveBeenCalledWith(
      'These Data Marts stop until a fitting Credential is selected: 3 you cannot see',
      expect.anything()
    );
  });

  it('shows nothing when no Data Mart stops', async () => {
    await publishWith({ stoppingDataMarts: [], hiddenStoppingCount: 0 });
    expect(toast).not.toHaveBeenCalled();
  });

  it('a response without stoppingDataMarts still reports success', async () => {
    await publishWith({} as { stoppingDataMarts: never[]; hiddenStoppingCount: number });
    expect(toast.success).toHaveBeenCalledWith('Published');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('activating a version shows the Data Marts that will stop', async () => {
    const { result } = await publishWith({ stoppingDataMarts: [], hiddenStoppingCount: 0 });
    vi.spyOn(ConnectorBuilderApiService.prototype, 'activateVersion').mockResolvedValue({
      activeVersionId: 'v1',
      activeVersion: 1,
      stoppingDataMarts: [{ id: 'a', title: 'Sales' }],
      hiddenStoppingCount: 0,
    });
    await act(async () => {
      await result.current.activateVersion(1);
    });
    expect(toast).toHaveBeenCalledWith(
      'These Data Marts stop until a fitting Credential is selected: Sales',
      expect.anything()
    );
  });
});

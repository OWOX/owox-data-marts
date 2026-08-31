import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { BuilderProvider } from '../../../shared/model/context/BuilderProvider';
import { useBuilder } from '../../../shared/model/hooks/useBuilder';
import type { BuilderManifest, ManifestNode } from '../../../shared/model/manifest.types';
import { PaginationEditor } from './PaginationEditor';

// Dynamic import inside the factory: `vi.mock` is hoisted above every import, so a
// top-level binding is not initialised yet when the factory runs.
vi.mock('@owox/ui/components/select', async () =>
  (await import('../../select-test-mock')).selectAsNativeElement()
);

/**
 * Seeds the builder with a node whose `pagination` block is taken verbatim, the way a
 * published manifest reaches the form: `parseManifestJson` normalizes only the top level,
 * so whatever an MCP client or a hand-written manifest declared arrives here untouched.
 */
function Seed({ pagination }: { pagination: unknown }) {
  const { setManifest } = useBuilder();
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    setManifest({
      version: '1.0',
      name: 'MyApi',
      baseUrl: 'https://api.example.com',
      parameters: {},
      nodes: {
        items: {
          request: { method: 'GET', path: '/items' },
          recordSelector: { recordPath: [] },
          fields: {},
          pagination,
        },
      },
    } as unknown as BuilderManifest);
  }, [setManifest, pagination]);
  return null;
}

function Probe() {
  const { manifest } = useBuilder();
  // The node only exists after Seed's effect has run, so read it as possibly-absent.
  const nodes: Record<string, ManifestNode | undefined> = manifest.nodes;
  return <pre data-testid='pagination-json'>{JSON.stringify(nodes.items?.pagination)}</pre>;
}

function setup(pagination: unknown) {
  render(
    <BuilderProvider>
      <Seed pagination={pagination} />
      <PaginationEditor basePath={['nodes', 'items', 'pagination']} />
      <Probe />
    </BuilderProvider>
  );
}

describe('PaginationEditor — manifest shapes it must render', () => {
  it('renders the documented cursor block (cursor.from/path, no cursorPath)', () => {
    setup({
      type: 'cursor',
      cursorParam: 'pageToken',
      cursor: { from: 'body', path: ['meta', 'next_cursor'] },
    });

    expect(screen.getByTestId('pagination-editor')).toBeInTheDocument();
    expect(screen.getByLabelText('Cursor source')).toHaveValue('body');
    expect(screen.getByPlaceholderText('data.pageInfo.endCursor')).toHaveValue('meta.next_cursor');
    // The legacy field is simply absent, not blank-with-a-stale-value.
    expect(screen.getByPlaceholderText('paging.next')).toHaveValue('');
  });

  it('renders the legacy cursorPath shape', () => {
    setup({ type: 'cursor', cursorPath: ['paging', 'next'], cursorParam: 'after' });

    expect(screen.getByPlaceholderText('paging.next')).toHaveValue('paging.next');
    expect(screen.getByPlaceholderText('after')).toHaveValue('after');
  });

  it('renders a cursor block that names no legacy cursorParam (inject-only)', () => {
    setup({
      type: 'cursor',
      cursor: { from: 'header', header: 'Link', linkRel: 'next' },
      inject: { into: 'path' },
    });

    expect(screen.getByLabelText('Cursor source')).toHaveValue('header');
    expect(screen.getByPlaceholderText('Link')).toHaveValue('Link');
    expect(screen.getByPlaceholderText('next')).toHaveValue('next');
  });

  it('renders a stopCondition that carries no path', () => {
    // The engine tolerates it (`stop.path || []`), so the form must not be the thing
    // that refuses to open the node.
    setup({ type: 'cursor', cursor: { from: 'body', path: ['next'] }, stopCondition: {} });

    expect(screen.getByPlaceholderText('pageInfo.hasNextPage')).toHaveValue('');
  });

  it('renders offset pagination that names no legacy offsetParam', () => {
    setup({ type: 'offset', pageSize: 100, inject: { into: 'header', name: 'X-Offset' } });

    expect(screen.getByPlaceholderText('offset')).toHaveValue('');
    expect(screen.getByLabelText('Offset inject name')).toHaveValue('X-Offset');
  });

  it('renders page pagination that names no legacy pageParam', () => {
    setup({ type: 'page', inject: { into: 'header', name: 'X-Page' } });

    expect(screen.getByPlaceholderText('page')).toHaveValue('');
    expect(screen.getByLabelText('Page inject name')).toHaveValue('X-Page');
  });

  it('keeps the configuration when the already-selected type is clicked again', () => {
    const configured = {
      type: 'cursor',
      cursorParam: 'pageToken',
      cursor: { from: 'body', path: ['meta', 'next_cursor'] },
      inject: { into: 'query', name: 'pageToken' },
      stopCondition: { path: ['meta', 'done'], equals: true },
    };
    setup(configured);

    fireEvent.click(screen.getByRole('button', { name: 'Cursor' }));

    expect(JSON.parse(screen.getByTestId('pagination-json').textContent)).toEqual(configured);
  });
});

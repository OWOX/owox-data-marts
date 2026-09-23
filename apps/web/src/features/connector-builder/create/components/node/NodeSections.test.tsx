import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useReducer } from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { NodeSections } from './NodeSections';
import { BuilderContext } from '../../../shared/model/context/context';
import { builderReducer, initialBuilderState } from '../../../shared/model/context/reducer';
import type { BuilderState } from '../../../shared/model/context/types';
import { parseManifestJson } from '../../../shared/model/manifestJson';

// `RequestEditor` and `FieldsEditor` read `node.request` / `node.fields` unguarded themselves
// (RequestEditor.tsx reads `request.method`, FieldsEditor.tsx reads `Object.entries(node.fields)`),
// so they throw on the very node shapes under test here. Those reads live in other files and are
// tracked separately; stub the two leaves so this spec stays about the reads NodeSections itself
// performs. Every other section editor below is the real one.
vi.mock('./RequestEditor', () => ({
  RequestEditor: () => <div data-testid='request-editor' />,
}));
vi.mock('./FieldsEditor', () => ({
  FieldsEditor: () => <div data-testid='fields-editor' />,
}));

/**
 * Seed the store straight from Code-mode JSON. `parseManifestJson` normalizes only the top
 * level (`parameters`/`nodes` defaults), so whatever node shape an author — or an
 * MCP-authored manifest — pastes reaches this pane verbatim. The engine is likewise tolerant:
 * `ManifestParser` requires `recordSelector` only for sync retrievers, and `RecordSelector`
 * falls back to an empty record path. So `request`, `recordSelector` and `fields` can all be
 * missing from a node the engine still runs.
 */
function seed(json: string): BuilderState {
  const parsed = parseManifestJson(json);
  if (!parsed.ok) throw new Error(parsed.error);
  return { ...initialBuilderState, manifest: parsed.manifest };
}

// Snapshot of the (real) store's state as of the most recent render, so a test can assert
// on what actually landed in the manifest rather than only on what the pane draws. Held in
// an object so the Harness mutates a property instead of reassigning an outer binding,
// which the react-hooks lint rules forbid.
const latest: { state?: BuilderState } = {};

function Harness({ json }: { json: string }) {
  const [state, dispatch] = useReducer(builderReducer, json, seed);
  latest.state = state;
  return (
    <BuilderContext.Provider value={{ state, dispatch }}>
      <NodeSections nodeName='items' />
    </BuilderContext.Provider>
  );
}

function renderSections(json: string) {
  latest.state = undefined;
  return render(<Harness json={json} />);
}

/** The `items` node as it currently stands in the store. */
function storedNode(): Record<string, unknown> {
  const node = latest.state?.manifest.nodes.items;
  if (!node) throw new Error('No "items" node in the store');
  return node as unknown as Record<string, unknown>;
}

/** Switch the retriever mode with the toggle inside the retriever block. */
function selectRetriever(label: 'Sync' | 'Async') {
  const group = screen.getByRole('group', { name: 'Retriever' });
  fireEvent.click(within(group).getByRole('button', { name: label }));
}

/** The header of the section card whose title is `title`. */
function sectionHeader(title: string): HTMLElement {
  const header = screen
    .getByText(title, { selector: '[data-slot="card-title"]' })
    .closest('[data-slot="card-header"]');
  if (!(header instanceof HTMLElement)) throw new Error(`No section card titled "${title}"`);
  return header;
}

/** The count badge a section shows in its always-visible header actions, if any. */
function sectionBadge(title: string): string | null {
  return within(sectionHeader(title)).queryByText(/^\d+$/)?.textContent ?? null;
}

/** The subtitle a section card shows next to its title, if any. */
function sectionSubtitle(title: string): string | null {
  return sectionHeader(title).querySelector('[data-slot="card-description"]')?.textContent ?? null;
}

/** The response format currently selected in the retriever block. */
function selectedResponseFormat(): string | null {
  const group = screen.getByRole('group', { name: 'Response format' });
  const pressed = within(group)
    .getAllByRole('button')
    .find(b => b.getAttribute('aria-pressed') === 'true');
  return pressed?.textContent ?? null;
}

// Card collapse state is persisted per card name in localStorage, so start each test clean.
beforeEach(() => {
  localStorage.clear();
});

describe('NodeSections', () => {
  it('renders a node whose only content is an empty recordSelector', () => {
    // The shape that white-screened the pane: no request, no fields, no record path.
    renderSections('{"nodes":{"items":{"recordSelector":{}}}}');
    expect(screen.getByTestId('node-sections')).toBeInTheDocument();
  });

  describe('fields', () => {
    it('shows no field count for a node with no fields at all', () => {
      renderSections(
        '{"nodes":{"items":{"request":{"method":"GET","path":"/v1/items"},"recordSelector":{"recordPath":[]}}}}'
      );
      expect(sectionBadge('Fields')).toBeNull();
    });

    it('shows no field count for a node with an empty fields object', () => {
      renderSections(
        '{"nodes":{"items":{"request":{"method":"GET","path":"/v1/items"},"recordSelector":{"recordPath":[]},"fields":{}}}}'
      );
      expect(sectionBadge('Fields')).toBeNull();
    });

    it('counts the fields a node does declare', () => {
      renderSections(
        '{"nodes":{"items":{"request":{"method":"GET","path":"/v1/items"},"recordSelector":{"recordPath":[]},"fields":{"id":{"type":"string"},"name":{"type":"string"}}}}}'
      );
      expect(sectionBadge('Fields')).toBe('2');
    });
  });

  describe('request', () => {
    it('omits the subtitle for a node with no request at all', () => {
      renderSections('{"nodes":{"items":{"recordSelector":{"recordPath":[]},"fields":{}}}}');
      expect(sectionSubtitle('Request')).toBeNull();
    });

    it('omits the subtitle for a node whose request has an empty path', () => {
      renderSections(
        '{"nodes":{"items":{"request":{"method":"GET","path":""},"recordSelector":{"recordPath":[]},"fields":{}}}}'
      );
      expect(sectionSubtitle('Request')).toBeNull();
    });

    it('shows method and path as the subtitle when the request has one', () => {
      renderSections(
        '{"nodes":{"items":{"request":{"method":"POST","path":"/v1/items"},"recordSelector":{"recordPath":[]},"fields":{}}}}'
      );
      expect(sectionSubtitle('Request')).toBe('POST /v1/items');
    });
  });

  describe('record selector', () => {
    it('defaults the response format to JSON for a node with no recordSelector at all', () => {
      // What an async-retriever node looks like: ManifestParser only demands a
      // recordSelector for sync retrievers, so this reaches the pane as-is.
      renderSections(
        '{"nodes":{"items":{"request":{"method":"GET","path":"/v1/items"},"fields":{}}}}'
      );
      expect(selectedResponseFormat()).toBe('JSON');
    });

    it('defaults the response format to JSON for a recordSelector that declares none', () => {
      renderSections(
        '{"nodes":{"items":{"request":{"method":"GET","path":"/v1/items"},"recordSelector":{"recordPath":[]},"fields":{}}}}'
      );
      expect(selectedResponseFormat()).toBe('JSON');
    });

    it('shows the response format a recordSelector does declare', () => {
      renderSections(
        '{"nodes":{"items":{"request":{"method":"GET","path":"/v1/items"},"recordSelector":{"recordPath":[],"responseFormat":"csv"},"fields":{}}}}'
      );
      expect(selectedResponseFormat()).toBe('CSV');
    });
  });

  describe('error handler', () => {
    it('shows no filter count for an errorHandler that declares no responseFilters', () => {
      // ManifestParser validates errorHandler.responseFilters only when it is present, so an
      // errorHandler without one is a shape the engine runs.
      renderSections(
        '{"nodes":{"items":{"request":{"method":"GET","path":"/v1/items"},"recordSelector":{"recordPath":[]},"fields":{},"errorHandler":{}}}}'
      );
      expect(sectionBadge('Error handling')).toBeNull();
    });

    it('counts the response filters an errorHandler does declare', () => {
      renderSections(
        '{"nodes":{"items":{"request":{"method":"GET","path":"/v1/items"},"recordSelector":{"recordPath":[]},"fields":{},"errorHandler":{"responseFilters":[{"httpCodes":[429],"action":"RETRY"}]}}}}'
      );
      expect(sectionBadge('Error handling')).toBe('1');
    });
  });

  describe('retriever mode', () => {
    const WITH_ERROR_HANDLER =
      '{"nodes":{"items":{"request":{"method":"GET","path":"/v1/items"},"recordSelector":{"recordPath":[]},"fields":{},"errorHandler":{"responseFilters":[{"httpCodes":[429],"action":"RETRY"}]}}}}';

    it('drops an errorHandler when the node is switched to the async retriever', () => {
      // `ManifestParser` refuses errorHandler + async (it only drives sync retrievers), and
      // the Error handling section is hidden while async — so an errorHandler left behind
      // here would fail publish with no way to remove it outside Code mode.
      renderSections(WITH_ERROR_HANDLER);
      expect(sectionBadge('Error handling')).toBe('1');

      selectRetriever('Async');

      expect(storedNode().errorHandler).toBeUndefined();
      // What the engine is actually handed: undefined does not survive serialization.
      expect(JSON.stringify(storedNode())).not.toContain('errorHandler');
      expect(screen.queryByText('Error handling')).not.toBeInTheDocument();
    });

    it('keeps the errorHandler while the node stays sync', () => {
      renderSections(WITH_ERROR_HANDLER);
      selectRetriever('Sync');
      expect(storedNode().errorHandler).toBeDefined();
      expect(sectionBadge('Error handling')).toBe('1');
    });
  });
});

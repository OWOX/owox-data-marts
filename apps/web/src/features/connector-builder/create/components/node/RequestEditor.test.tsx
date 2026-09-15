import { describe, it, expect } from 'vitest';
import { useReducer } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RequestEditor } from './RequestEditor';
import { BuilderContext } from '../../../shared/model/context/context';
import { builderReducer, initialBuilderState } from '../../../shared/model/context/reducer';
import type { BuilderState } from '../../../shared/model/context/types';
import { parseManifestJson } from '../../../shared/model/manifestJson';

// Snapshot of the (real) store's state as of the most recent render, so a test can assert
// on what actually landed in the manifest rather than only on a mock call. Held in an
// object so the Harness mutates a property instead of reassigning an outer binding, which
// the react-hooks lint rules forbid.
const latest: { state?: BuilderState } = {};

/**
 * Seed the store straight from Code-mode JSON. `parseManifestJson` normalizes only the top
 * level (`parameters`/`nodes` defaults), so whatever node shape an author — or an
 * MCP-authored manifest — pastes reaches this editor verbatim. A node body with no `request`
 * at all is what a half-finished Code-mode paste looks like; a `request` that carries neither
 * `method` nor `path` is a shape the engine itself accepts, since `ManifestParser` checks
 * only that `request` exists and never validates its `method` or `path`.
 */
function seed(json: string): BuilderState {
  const parsed = parseManifestJson(json);
  if (!parsed.ok) throw new Error(parsed.error);
  return { ...initialBuilderState, manifest: parsed.manifest };
}

function Harness({ json }: { json: string }) {
  const [state, dispatch] = useReducer(builderReducer, json, seed);
  latest.state = state;
  return (
    <BuilderContext.Provider value={{ state, dispatch }}>
      <RequestEditor nodeName='items' />
    </BuilderContext.Provider>
  );
}

function renderEditor(json: string) {
  latest.state = undefined;
  return render(<Harness json={json} />);
}

function pathInput(): HTMLInputElement {
  return screen.getByPlaceholderText('/v1/items');
}

function methodTrigger(): HTMLElement {
  return screen.getByRole('combobox');
}

function storedRequest(): unknown {
  return latest.state?.manifest.nodes.items.request;
}

describe('RequestEditor', () => {
  it('renders a node with no request at all', () => {
    // The shape that white-screened the pane: the node body carries only a recordSelector.
    renderEditor('{"nodes":{"items":{"recordSelector":{}}}}');
    expect(screen.getByTestId('request-editor')).toBeInTheDocument();
  });

  it('falls back to GET and an empty path for a node with no request at all', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{}}}}');
    expect(methodTrigger()).toHaveTextContent('GET');
    expect(pathInput().value).toBe('');
  });

  it('falls back to GET and an empty path for a request that declares neither', () => {
    // ManifestParser only checks that `request` exists — method and path are never
    // validated — so this manifest reaches the pane from a connector the engine accepts.
    renderEditor('{"nodes":{"items":{"recordSelector":{},"request":{}}}}');
    expect(methodTrigger()).toHaveTextContent('GET');
    expect(pathInput().value).toBe('');
  });

  it('shows the method and path a request does declare', () => {
    renderEditor(
      '{"nodes":{"items":{"recordSelector":{},"request":{"method":"POST","path":"/v1/items"}}}}'
    );
    expect(methodTrigger()).toHaveTextContent('POST');
    expect(pathInput().value).toBe('/v1/items');
  });

  it('creates the request when a path is typed into a node that had none', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{}}}}');
    fireEvent.change(pathInput(), { target: { value: '/v1/rows' } });
    expect(storedRequest()).toEqual({ path: '/v1/rows' });
  });

  it('shows no body editor for a node with no request (nothing declares POST)', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{}}}}');
    expect(screen.queryByTestId('request-body')).not.toBeInTheDocument();
  });

  it('shows the body editor for a POST request', () => {
    renderEditor(
      '{"nodes":{"items":{"recordSelector":{},"request":{"method":"POST","path":"/v1/items","body":{"q":1}}}}}'
    );
    expect(screen.getByTestId('request-body')).toHaveValue('{\n  "q": 1\n}');
  });
});

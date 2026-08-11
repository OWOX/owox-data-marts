import { describe, it, expect } from 'vitest';
import { useReducer } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecordSelectorEditor } from './RecordSelectorEditor';
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
 * MCP-authored manifest — pastes reaches this editor verbatim. That is exactly the input
 * under test here: the engine tolerates a `recordSelector` with no `recordPath`
 * (`RecordSelector` falls back to `[]`) and, for an async retriever, no `recordSelector`
 * at all (`ManifestParser` only requires it for sync nodes).
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
      <RecordSelectorEditor nodeName='items' />
    </BuilderContext.Provider>
  );
}

function renderEditor(json: string) {
  latest.state = undefined;
  return render(<Harness json={json} />);
}

function pathInput(): HTMLInputElement {
  return screen.getByRole('textbox');
}

function storedRecordPath(): unknown {
  return latest.state?.manifest.nodes.items.recordSelector.recordPath;
}

describe('RecordSelectorEditor', () => {
  it('renders an empty path for a recordSelector the engine accepts but that carries no recordPath', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{}}}}');
    expect(pathInput().value).toBe('');
  });

  it('renders an empty path for a node with no recordSelector at all (async retrievers have none)', () => {
    renderEditor('{"nodes":{"items":{}}}');
    expect(pathInput().value).toBe('');
  });

  it('renders an empty path when recordPath is not an array (the engine ignores it too)', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{"recordPath":"data.items"}}}}');
    expect(pathInput().value).toBe('');
  });

  it('renders an existing record path as a dot-path', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{"recordPath":["data","items"]}}}}');
    expect(pathInput().value).toBe('data.items');
  });

  it('writes a typed dot-path into the manifest as path segments', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{"recordPath":["data","items"]}}}}');
    fireEvent.change(pathInput(), { target: { value: 'data.rows' } });
    expect(storedRecordPath()).toEqual(['data', 'rows']);
  });

  it('writes an empty path when the input is cleared', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{"recordPath":["data","items"]}}}}');
    fireEvent.change(pathInput(), { target: { value: '' } });
    expect(storedRecordPath()).toEqual([]);
  });

  it('creates the recordSelector when a path is typed into a node that had none', () => {
    renderEditor('{"nodes":{"items":{}}}');
    fireEvent.change(pathInput(), { target: { value: 'data.rows' } });
    expect(storedRecordPath()).toEqual(['data', 'rows']);
  });
});

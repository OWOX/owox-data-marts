import { describe, it, expect, vi } from 'vitest';
import { useReducer } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecordFilterEditor } from './RecordFilterEditor';
import { BuilderContext } from '../../../shared/model/context/context';
import { builderReducer, initialBuilderState } from '../../../shared/model/context/reducer';
import type { BuilderState } from '../../../shared/model/context/types';
import { parseManifestJson } from '../../../shared/model/manifestJson';

// Dynamic import inside the factory: `vi.mock` is hoisted above every import, so a
// top-level binding is not initialised yet when the factory runs.
vi.mock('@owox/ui/components/select', async () =>
  (await import('../../select-test-mock')).selectAsNativeElement()
);

// Snapshot of the (real) store's state as of the most recent render, so a test can assert
// on what actually landed in the manifest rather than only on a mock call. Held in an
// object so the Harness mutates a property instead of reassigning an outer binding, which
// the react-hooks lint rules forbid.
const latest: { state?: BuilderState } = {};

/**
 * Seed the store straight from Code-mode JSON. `parseManifestJson` normalizes only the top
 * level (`parameters`/`nodes` defaults), so whatever node shape an author — or an
 * MCP-authored manifest — pastes reaches this editor verbatim. A `recordFilter` with no
 * `path` is a shape the engine ultimately rejects (`ManifestParser` demands a non-empty
 * string path), but it is exactly what a half-finished Code-mode paste looks like, and the
 * pane has to survive long enough for the author to finish it.
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
      <RecordFilterEditor nodeName='items' />
    </BuilderContext.Provider>
  );
}

function renderEditor(json: string) {
  latest.state = undefined;
  return render(<Harness json={json} />);
}

function fieldPathInput(): HTMLInputElement {
  return screen.getByPlaceholderText('sheetType');
}

function storedFilter(): unknown {
  return latest.state?.manifest.nodes.items.recordFilter;
}

describe('RecordFilterEditor', () => {
  it('renders a recordFilter that carries no path', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{},"recordFilter":{"operator":"isNull"}}}}');
    expect(screen.getByTestId('record-filter-editor')).toBeInTheDocument();
  });

  it('shows an empty field path for a recordFilter that carries no path', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{},"recordFilter":{"operator":"isNull"}}}}');
    expect(fieldPathInput().value).toBe('');
    expect(screen.getByLabelText('Enable record filter')).toBeChecked();
  });

  it('shows an empty field path when path is not an array', () => {
    renderEditor(
      '{"nodes":{"items":{"recordSelector":{},"recordFilter":{"path":"sheetType","operator":"isNull"}}}}'
    );
    expect(fieldPathInput().value).toBe('');
  });

  it('shows an existing path as a dot-path', () => {
    renderEditor(
      '{"nodes":{"items":{"recordSelector":{},"recordFilter":{"path":["meta","kind"],"operator":"equals","value":"GRID"}}}}'
    );
    expect(fieldPathInput().value).toBe('meta.kind');
  });

  it('writes a typed dot-path into a recordFilter that had none', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{},"recordFilter":{"operator":"isNull"}}}}');
    fireEvent.change(fieldPathInput(), { target: { value: 'meta.kind' } });
    expect(storedFilter()).toEqual({ path: ['meta', 'kind'], operator: 'isNull' });
  });

  it('keeps an empty path when the operator is changed on a filter that had none', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{},"recordFilter":{"operator":"isNull"}}}}');
    fireEvent.change(screen.getByLabelText('Filter operator'), { target: { value: 'contains' } });
    expect(storedFilter()).toEqual({ path: [], operator: 'contains' });
  });

  it('renders nothing but the toggle when the node has no recordFilter', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{}}}}');
    expect(screen.getByLabelText('Enable record filter')).not.toBeChecked();
    expect(screen.queryByPlaceholderText('sheetType')).not.toBeInTheDocument();
  });
});

import { describe, it, expect } from 'vitest';
import { useReducer } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { IncrementalEditor } from './IncrementalEditor';
import { BuilderContext } from '../../../shared/model/context/context';
import { builderReducer, initialBuilderState } from '../../../shared/model/context/reducer';
import type { BuilderState } from '../../../shared/model/context/types';
import { parseManifestJson } from '../../../shared/model/manifestJson';

const latest: { state?: BuilderState } = {};

/** Seed the store straight from Code-mode JSON, the way FieldsEditor.test.tsx does:
 * `parseManifestJson` normalizes only the top level, so a node body — including keys this
 * editor knows nothing about — reaches the editor verbatim. */
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
      <IncrementalEditor nodeName='items' />
    </BuilderContext.Provider>
  );
}

function renderEditor(json: string) {
  latest.state = undefined;
  return render(<Harness json={json} />);
}

function storedIncremental(): Record<string, unknown> {
  return latest.state?.manifest.nodes.items.incremental as unknown as Record<string, unknown>;
}

// A manifest authored before the builder dropped `cursorField` still carries it. The engine
// (`packages/connectors/src`) has never read the key, and the parser only enforces required
// ones, so it is inert — but it must not break loading, and an author who never opens this
// editor must not have it silently rewritten out from under them.
const WITH_CURSOR_FIELD = JSON.stringify({
  nodes: {
    items: {
      recordSelector: {},
      incremental: {
        strategy: 'day-by-day',
        cursorField: 'updated_at',
        request: { into: 'query', startName: 'from', endName: 'end', format: 'YYYY-MM-DD' },
      },
    },
  },
});

describe('IncrementalEditor', () => {
  it('offers no Cursor field input — the engine never reads one', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{}}}}');
    fireEvent.click(screen.getByRole('button', { name: 'Day-by-day' }));

    expect(screen.getByTestId('incremental-editor')).toBeInTheDocument();
    expect(screen.queryByText('Cursor field')).toBeNull();
    expect(storedIncremental()).not.toHaveProperty('cursorField');
  });

  it('loads a manifest that already carries cursorField without breaking', () => {
    renderEditor(WITH_CURSOR_FIELD);

    expect(screen.getByTestId('incremental-editor')).toBeInTheDocument();
    expect(screen.queryByText('Cursor field')).toBeNull();
    expect(screen.getByPlaceholderText('start_date')).toHaveValue('from');
    expect(screen.getByPlaceholderText('end_date')).toHaveValue('end');
  });

  it('preserves an existing cursorField when editing the request', () => {
    renderEditor(WITH_CURSOR_FIELD);
    fireEvent.change(screen.getByPlaceholderText('start_date'), { target: { value: 'since' } });

    expect(storedIncremental()).toEqual({
      strategy: 'day-by-day',
      cursorField: 'updated_at',
      request: { into: 'query', startName: 'since', endName: 'end', format: 'YYYY-MM-DD' },
    });
  });

  it('preserves an existing cursorField across a strategy switch, which rewrites the object', () => {
    renderEditor(WITH_CURSOR_FIELD);
    fireEvent.click(screen.getByRole('button', { name: 'Range' }));

    expect(storedIncremental()).toEqual({
      strategy: 'range',
      cursorField: 'updated_at',
      request: { into: 'query', startName: 'from', endName: 'end', format: 'YYYY-MM-DD' },
    });
  });
});

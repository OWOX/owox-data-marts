import { describe, it, expect } from 'vitest';
import { useReducer } from 'react';
import { render, screen, within } from '@testing-library/react';
import { TransformationsEditor } from './TransformationsEditor';
import { BuilderContext } from '../../../shared/model/context/context';
import { builderReducer, initialBuilderState } from '../../../shared/model/context/reducer';
import type { BuilderState } from '../../../shared/model/context/types';
import { parseManifestJson } from '../../../shared/model/manifestJson';

const ALL_TYPES = JSON.stringify({
  nodes: {
    items: {
      recordSelector: {},
      transformations: [
        { type: 'add', field: 'source', value: 'api' },
        { type: 'remove', field: 'internal' },
        { type: 'keysToLower' },
        { type: 'flatten', separator: '_' },
      ],
    },
  },
});

function seed(json: string): BuilderState {
  const parsed = parseManifestJson(json);
  if (!parsed.ok) throw new Error(parsed.error);
  return { ...initialBuilderState, manifest: parsed.manifest };
}

function Harness({ json }: { json: string }) {
  const [state, dispatch] = useReducer(builderReducer, json, seed);
  return (
    <BuilderContext.Provider value={{ state, dispatch, codeEdits: { current: null } }}>
      <TransformationsEditor nodeName='items' />
    </BuilderContext.Provider>
  );
}

const REDISCOVER = /Run the test, then Discover fields/;

describe('TransformationsEditor', () => {
  it('says what each transformation does', () => {
    render(<Harness json={ALL_TYPES} />);

    expect(
      within(screen.getByTestId('transform-0')).getByText(/constant, or a template/)
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('transform-1')).getByText(/Deletes a top-level field/)
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('transform-2')).getByText(/Lowercases every top-level key/)
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('transform-3')).getByText(/stats\.clicks becomes stats_clicks/)
    ).toBeInTheDocument();
  });

  // A transformation that renames keys leaves the node's fields naming the old ones, so the
  // output columns come back empty and the transformation looks as if it did nothing.
  it('tells the author to discover fields again after a transformation that renames keys', () => {
    render(<Harness json={ALL_TYPES} />);

    expect(within(screen.getByTestId('transform-0')).queryByText(REDISCOVER)).toBeNull();
    expect(within(screen.getByTestId('transform-1')).queryByText(REDISCOVER)).toBeNull();
    expect(within(screen.getByTestId('transform-2')).getByText(REDISCOVER)).toBeInTheDocument();
    expect(within(screen.getByTestId('transform-3')).getByText(REDISCOVER)).toBeInTheDocument();
  });

  it('labels the flatten separator', () => {
    render(<Harness json={ALL_TYPES} />);

    expect(screen.getByRole('textbox', { name: 'Separator' })).toHaveValue('_');
  });
});

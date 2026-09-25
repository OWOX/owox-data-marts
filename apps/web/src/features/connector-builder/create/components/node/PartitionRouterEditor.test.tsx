import { describe, it, expect } from 'vitest';
import { useReducer } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PartitionRouterEditor } from './PartitionRouterEditor';
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
 * MCP-authored manifest — pastes reaches this editor verbatim. A `substream` router with no
 * `parent` is a shape the engine ultimately rejects (`ManifestParser` demands a parent
 * request object), but it is exactly what a half-finished Code-mode paste looks like, and
 * the pane has to survive long enough for the author to finish it.
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
      <PartitionRouterEditor nodeName='items' />
    </BuilderContext.Provider>
  );
}

function renderEditor(json: string) {
  latest.state = undefined;
  return render(<Harness json={json} />);
}

/** The Radix select inside the `Parent method` label (the native `Partition source` select
 * carries the same role, so scope the lookup to the label). */
function parentMethodTrigger(): HTMLElement {
  const label = screen.getByText('Parent method').closest('label');
  if (!(label instanceof HTMLElement)) throw new Error('No "Parent method" label');
  return within(label).getByRole('combobox');
}

function storedRouter(): unknown {
  return latest.state?.manifest.nodes.items.partitionRouter;
}

const NO_PARENT =
  '{"nodes":{"items":{"recordSelector":{},"partitionRouter":{"type":"substream","partitionField":"campaign_id"}}}}';

describe('PartitionRouterEditor', () => {
  it('renders a substream router that carries no parent', () => {
    renderEditor(NO_PARENT);
    expect(screen.getByTestId('partition-router-editor')).toBeInTheDocument();
  });

  it('shows empty parent fields for a substream router that carries no parent', () => {
    renderEditor(NO_PARENT);
    expect(parentMethodTrigger()).toHaveTextContent('GET');
    expect(screen.getByPlaceholderText('/campaigns')).toHaveValue('');
    expect(screen.getByPlaceholderText('data')).toHaveValue('');
    expect(screen.getByPlaceholderText('id')).toHaveValue('');
    expect(screen.getByPlaceholderText('campaign_id')).toHaveValue('campaign_id');
  });

  it('shows empty parent fields for a parent that carries no request', () => {
    renderEditor(
      '{"nodes":{"items":{"recordSelector":{},"partitionRouter":{"type":"substream","parent":{"key":"id","recordPath":["data"]},"partitionField":"campaign_id"}}}}'
    );
    expect(parentMethodTrigger()).toHaveTextContent('GET');
    expect(screen.getByPlaceholderText('/campaigns')).toHaveValue('');
    expect(screen.getByPlaceholderText('data')).toHaveValue('data');
    expect(screen.getByPlaceholderText('id')).toHaveValue('id');
  });

  it('shows an empty parent record path when recordPath is not an array', () => {
    renderEditor(
      '{"nodes":{"items":{"recordSelector":{},"partitionRouter":{"type":"substream","parent":{"request":{"method":"GET","path":"/c"},"recordPath":"data","key":"id"},"partitionField":"campaign_id"}}}}'
    );
    expect(screen.getByPlaceholderText('data')).toHaveValue('');
  });

  it('shows the parent a complete substream router does declare', () => {
    renderEditor(
      '{"nodes":{"items":{"recordSelector":{},"partitionRouter":{"type":"substream","parent":{"request":{"method":"POST","path":"/campaigns"},"recordPath":["data","rows"],"key":"id"},"partitionField":"campaign_id"}}}}'
    );
    expect(parentMethodTrigger()).toHaveTextContent('POST');
    expect(screen.getByPlaceholderText('/campaigns')).toHaveValue('/campaigns');
    expect(screen.getByPlaceholderText('data')).toHaveValue('data.rows');
    expect(screen.getByPlaceholderText('id')).toHaveValue('id');
  });

  it('writes a parent path into a substream router that had no parent', () => {
    renderEditor(NO_PARENT);
    fireEvent.change(screen.getByPlaceholderText('/campaigns'), { target: { value: '/c' } });
    expect(storedRouter()).toEqual({
      type: 'substream',
      partitionField: 'campaign_id',
      parent: { request: { path: '/c' } },
    });
  });

  it('renders nothing but the toggle when the node has no partitionRouter', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{}}}}');
    expect(screen.getByLabelText('Enable partitioning')).not.toBeChecked();
    expect(screen.queryByPlaceholderText('/campaigns')).not.toBeInTheDocument();
  });
});

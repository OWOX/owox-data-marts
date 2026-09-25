import { describe, it, expect } from 'vitest';
import { useReducer } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FieldsEditor, hasUsableSample } from './FieldsEditor';
import { BuilderContext } from '../../../shared/model/context/context';
import { builderReducer, initialBuilderState } from '../../../shared/model/context/reducer';
import type { BuilderState } from '../../../shared/model/context/types';
import { parseManifestJson } from '../../../shared/model/manifestJson';
import { addField } from '../../parameters-test-helpers';

describe('hasUsableSample', () => {
  it('is false when there is no sample', () => {
    expect(hasUsableSample(null, 'items')).toBe(false);
  });
  it('is false when the sample belongs to another node', () => {
    expect(hasUsableSample({ node: 'other', records: [{ a: 1 }] }, 'items')).toBe(false);
  });
  it('is false when the sample has no records', () => {
    expect(hasUsableSample({ node: 'items', records: [] }, 'items')).toBe(false);
  });
  it('is true when the sample is for this node and has records', () => {
    expect(hasUsableSample({ node: 'items', records: [{ a: 1 }] }, 'items')).toBe(true);
  });
});

// Snapshot of the (real) store's state as of the most recent render, so a test can assert
// on what actually landed in the manifest rather than only on a mock call. Held in an
// object so the Harness mutates a property instead of reassigning an outer binding, which
// the react-hooks lint rules forbid.
const latest: { state?: BuilderState } = {};

/**
 * Seed the store straight from Code-mode JSON. `parseManifestJson` normalizes only the top
 * level (`parameters`/`nodes` defaults), so whatever node shape an author — or an
 * MCP-authored manifest — pastes reaches this editor verbatim. `fields` is the clearest
 * case: `ManifestParser` never inspects it at all, so a node with no `fields` is a shape
 * the engine happily runs.
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
      <FieldsEditor nodeName='items' />
    </BuilderContext.Provider>
  );
}

function renderEditor(json: string) {
  latest.state = undefined;
  return render(<Harness json={json} />);
}

function storedFields(): unknown {
  return latest.state?.manifest.nodes.items.fields;
}

describe('FieldsEditor', () => {
  it('renders a node with no fields at all', () => {
    // The shape that white-screened the pane: the node body carries only a recordSelector.
    renderEditor('{"nodes":{"items":{"recordSelector":{}}}}');
    expect(screen.getByTestId('fields-editor')).toBeInTheDocument();
  });

  it('shows the empty-fields state for a node with no fields at all', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{}}}}');
    expect(screen.getByText('No fields yet — add one above.')).toBeInTheDocument();
  });

  it('shows that same empty state for an empty fields object', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{},"fields":{}}}}');
    expect(screen.getByText('No fields yet — add one above.')).toBeInTheDocument();
  });

  it('lists the fields a node does declare', () => {
    renderEditor(
      '{"nodes":{"items":{"recordSelector":{},"fields":{"id":{"type":"string"},"qty":{"type":"integer"}}}}}'
    );
    expect(screen.getByTestId('field-id')).toBeInTheDocument();
    expect(screen.getByTestId('field-qty')).toBeInTheDocument();
  });

  it('creates the fields map when a field is added to a node that had none', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{}}}}');
    addField('id');
    expect(storedFields()).toEqual({ id: { type: 'string' } });
  });
});

describe('FieldsEditor — duplicate names', () => {
  // `commit` keys `fields` by name, so two rows called the same thing collapse to one entry
  // and the first row's type/data path/description are gone — while both rows stay on
  // screen until a reload. Flag them the same way a blank name is flagged.
  it('flags every row in a duplicate-name group', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{}}}}');
    addField('id');
    addField('id');
    addField('qty');

    expect(screen.getAllByLabelText('Duplicate field name')).toHaveLength(2);
  });

  it('does not flag a name that appears only once', () => {
    renderEditor(
      '{"nodes":{"items":{"recordSelector":{},"fields":{"id":{"type":"string"},"qty":{"type":"integer"}}}}}'
    );
    expect(screen.queryByLabelText('Duplicate field name')).toBeNull();
  });

  it('never lists a duplicated primary key twice in uniqueKeys', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{}}}}');
    addField('id');
    addField('id');
    // One checkbox per row; both rows carry the same name, so tick both.
    for (const box of screen.getAllByLabelText('Primary key: id')) {
      fireEvent.click(box);
    }

    expect(latest.state?.manifest.nodes.items.uniqueKeys).toEqual(['id']);
  });

  it('never lists a duplicated default field twice in defaultFields', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{}}}}');
    addField('id');
    addField('id');
    for (const box of screen.getAllByLabelText('Default field: id')) {
      fireEvent.click(box);
    }

    expect(latest.state?.manifest.nodes.items.defaultFields).toEqual(['id']);
  });
});

describe('FieldsEditor — whitespace while typing', () => {
  // Both inputs are controlled. Trimming inside their onChange wrote "Total " back as
  // "Total" and re-rendered without the space, so a space could never be typed at all and
  // the value was stuck on its first word.
  const ONE_FIELD = '{"nodes":{"items":{"recordSelector":{},"fields":{"id":{"type":"string"}}}}}';

  it('lets a space be typed into the description', () => {
    renderEditor(ONE_FIELD);
    const input = screen.getByTestId('fielddesc-id');

    fireEvent.change(input, { target: { value: 'Total ' } });
    expect(input).toHaveValue('Total ');

    fireEvent.change(input, { target: { value: 'Total clicks' } });
    expect(input).toHaveValue('Total clicks');
  });

  it('lets a space be typed into the data path', () => {
    // JSON keys may contain spaces, e.g. {"Total Clicks": 5} — reachable as stats.Total Clicks.
    renderEditor(ONE_FIELD);
    const input = screen.getByTestId('datapath-id');

    fireEvent.change(input, { target: { value: 'stats.Total ' } });
    expect(input).toHaveValue('stats.Total ');

    fireEvent.change(input, { target: { value: 'stats.Total Clicks' } });
    expect(input).toHaveValue('stats.Total Clicks');
  });

  it('still stores both trimmed in the manifest', () => {
    renderEditor(ONE_FIELD);
    fireEvent.change(screen.getByTestId('fielddesc-id'), {
      target: { value: '  Total clicks  ' },
    });
    fireEvent.change(screen.getByTestId('datapath-id'), { target: { value: '  stats.clicks  ' } });

    expect(storedFields()).toEqual({
      id: { type: 'string', description: 'Total clicks', dataPath: 'stats.clicks' },
    });
  });

  it('drops a value that is only whitespace rather than storing it', () => {
    renderEditor(ONE_FIELD);
    fireEvent.change(screen.getByTestId('fielddesc-id'), { target: { value: '   ' } });

    expect(storedFields()).toEqual({ id: { type: 'string' } });
  });
});

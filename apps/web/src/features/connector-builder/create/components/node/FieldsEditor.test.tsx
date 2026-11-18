import { describe, it, expect } from 'vitest';
import { useReducer } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { FieldsEditor, hasUsableSample } from './FieldsEditor';
import { BuilderContext } from '../../../shared/model/context/context';
import { builderReducer, initialBuilderState } from '../../../shared/model/context/reducer';
import type { BuilderState } from '../../../shared/model/context/types';
import { parseManifestJson } from '../../../shared/model/manifestJson';
import { addField } from '../../parameters-test-helpers';

const ONE_FIELD = '{"nodes":{"items":{"recordSelector":{},"fields":{"id":{"type":"string"}}}}}';

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
 * AI-authored manifest — pastes reaches this editor verbatim. `fields` is the clearest
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
    <BuilderContext.Provider value={{ state, dispatch, codeEdits: { current: null } }}>
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
    expect(screen.getByText('No fields yet — add one below.')).toBeInTheDocument();
  });

  it('shows that same empty state for an empty fields object', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{},"fields":{}}}}');
    expect(screen.getByText('No fields yet — add one below.')).toBeInTheDocument();
  });

  // The parameter tables add a row from under the table; here the button sat above it, beside
  // Discover fields, where nobody looked for it.
  it('adds a field from a row under the table, as the parameter tables do', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{},"fields":{"id":{"type":"string"}}}}}');

    const table = screen.getByRole('table');
    const add = screen.getByRole('button', { name: 'Add field' });
    expect(table.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(add).toHaveTextContent('Add field');
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
  // Two rows can show the same name, but only the row that had it first is saved under it.
  // Flag both, the same way a blank name is flagged.
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

describe('FieldsEditor — field name as you type', () => {
  it('renames as you type, with no Apply step', () => {
    renderEditor(
      '{"nodes":{"items":{"recordSelector":{},"fields":{"id":{"type":"string","dataPath":"x"}},"uniqueKeys":["id"],"defaultFields":["id"]}}}'
    );
    fireEvent.change(screen.getByTestId('fieldname-id'), { target: { value: 'user_id' } });

    expect(storedFields()).toEqual({ user_id: { type: 'string', dataPath: 'x' } });
    expect(latest.state?.manifest.nodes.items.uniqueKeys).toEqual(['user_id']);
    expect(latest.state?.manifest.nodes.items.defaultFields).toEqual(['user_id']);
    // The old EditableText trigger has role=button; the inline input has none.
    expect(within(screen.getByTestId('field-user_id')).queryByRole('button')).toBeNull();
  });

  it('keeps the same input while the name changes', () => {
    renderEditor(ONE_FIELD);
    const input = screen.getByTestId('fieldname-id');
    input.focus();
    fireEvent.change(input, { target: { value: 'idx' } });

    expect(screen.getByTestId('fieldname-idx')).toBe(input);
    expect(screen.getByPlaceholderText('Field name')).toBe(input);
    expect(document.activeElement).toBe(input);
  });

  it('shows the name raw while typing and stores it trimmed', () => {
    renderEditor(ONE_FIELD);
    const input = screen.getByTestId('fieldname-id');
    fireEvent.change(input, { target: { value: '  user_id ' } });

    expect(input).toHaveValue('  user_id ');
    expect(storedFields()).toEqual({ user_id: { type: 'string' } });
  });

  it('a passing duplicate keeps both rows', () => {
    renderEditor(
      '{"nodes":{"items":{"recordSelector":{},"fields":{"id":{"type":"string","dataPath":"a"},"id2":{"type":"integer","dataPath":"b"}},"uniqueKeys":["id"],"defaultFields":["id2"]}}}'
    );
    const second = screen.getByTestId('fieldname-id2');
    fireEvent.change(second, { target: { value: 'id' } });
    expect(second).toHaveValue('id');
    expect(screen.getAllByLabelText('Duplicate field name')).toHaveLength(2);
    expect(storedFields()).toEqual({
      id: { type: 'string', dataPath: 'a' },
      id2: { type: 'integer', dataPath: 'b' },
    });
    expect(latest.state?.manifest.nodes.items.defaultFields).toEqual(['id2']);
    fireEvent.change(second, { target: { value: 'id3' } });

    expect(storedFields()).toEqual({
      id: { type: 'string', dataPath: 'a' },
      id3: { type: 'integer', dataPath: 'b' },
    });
    expect(latest.state?.manifest.nodes.items.uniqueKeys).toEqual(['id']);
    expect(latest.state?.manifest.nodes.items.defaultFields).toEqual(['id3']);
  });

  it('keeps the row when the name is cleared and typed again', () => {
    renderEditor(
      '{"nodes":{"items":{"recordSelector":{},"fields":{"id":{"type":"integer","dataPath":"x"}},"uniqueKeys":["id"],"defaultFields":["id"]}}}'
    );
    const input = screen.getByTestId('fieldname-id');
    input.focus();
    fireEvent.change(input, { target: { value: '' } });
    expect(storedFields()).toEqual({ id: { type: 'integer', dataPath: 'x' } });
    expect(latest.state?.manifest.nodes.items.uniqueKeys).toEqual(['id']);
    const required = screen.getByLabelText('Field name is required');
    expect(input.compareDocumentPosition(required) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: 'user_id' } });
    expect(storedFields()).toEqual({ user_id: { type: 'integer', dataPath: 'x' } });
    expect(latest.state?.manifest.nodes.items.uniqueKeys).toEqual(['user_id']);
    expect(latest.state?.manifest.nodes.items.defaultFields).toEqual(['user_id']);
  });

  it('keeps the old name in the manifest when the node remounts mid-rename', () => {
    const { unmount } = renderEditor(
      '{"nodes":{"items":{"recordSelector":{},"fields":{"id":{"type":"string","dataPath":"a"},"id2":{"type":"integer","dataPath":"b"}},"uniqueKeys":["id"]}}}'
    );
    fireEvent.change(screen.getByTestId('fieldname-id2'), { target: { value: 'id' } });
    const manifest = JSON.stringify(latest.state!.manifest);
    unmount();
    render(<Harness json={manifest} />);

    expect(screen.getByTestId('fieldname-id')).toHaveValue('id');
    expect(screen.getByTestId('fieldname-id2')).toHaveValue('id2');
    expect(storedFields()).toEqual({
      id: { type: 'string', dataPath: 'a' },
      id2: { type: 'integer', dataPath: 'b' },
    });
  });

  const TWO_FIELDS =
    '{"nodes":{"items":{"recordSelector":{},"fields":{"id":{"type":"string","dataPath":"a"},"id2":{"type":"integer","dataPath":"b"}},"uniqueKeys":["id"]}}}';

  it('keeps a cleared field when another cell in the table changes', () => {
    renderEditor(TWO_FIELDS);
    const second = screen.getByTestId('fieldname-id2');
    fireEvent.change(second, { target: { value: '' } });
    fireEvent.blur(second);
    fireEvent.click(screen.getByLabelText('Default field: id'));

    expect(storedFields()).toEqual({
      id: { type: 'string', dataPath: 'a' },
      id2: { type: 'integer', dataPath: 'b' },
    });
    expect(latest.state?.manifest.nodes.items.defaultFields).toEqual(['id']);
  });

  it('keeps both fields when another cell changes while a name is a duplicate', () => {
    renderEditor(TWO_FIELDS);
    const second = screen.getByTestId('fieldname-id2');
    fireEvent.change(second, { target: { value: 'id' } });
    fireEvent.blur(second);
    fireEvent.click(screen.getAllByLabelText('Default field: id')[0]);

    expect(storedFields()).toEqual({
      id: { type: 'string', dataPath: 'a' },
      id2: { type: 'integer', dataPath: 'b' },
    });
    expect(latest.state?.manifest.nodes.items.defaultFields).toEqual(['id']);
    expect(screen.getAllByLabelText('Duplicate field name')).toHaveLength(2);
  });

  it('falls back to the name before the edit, not to the last valid keystroke', () => {
    renderEditor(
      '{"nodes":{"items":{"recordSelector":{},"fields":{"downloads":{"type":"integer"}},"uniqueKeys":["downloads"]}}}'
    );
    const input = screen.getByTestId('fieldname-downloads');
    for (const value of ['download', 'd', '']) {
      fireEvent.change(input, { target: { value } });
    }

    expect(storedFields()).toEqual({ downloads: { type: 'integer' } });
    expect(latest.state?.manifest.nodes.items.uniqueKeys).toEqual(['downloads']);
  });

  it('does not take a name that another row still keeps', () => {
    renderEditor(
      '{"nodes":{"items":{"recordSelector":{},"fields":{"start":{"type":"string","dataPath":"s"},"end":{"type":"integer","dataPath":"e"}}}}}'
    );
    const end = screen.getByTestId('fieldname-end');
    fireEvent.change(end, { target: { value: '' } });
    fireEvent.blur(end);
    fireEvent.change(screen.getByTestId('fieldname-start'), { target: { value: 'end' } });

    expect(storedFields()).toEqual({
      start: { type: 'string', dataPath: 's' },
      end: { type: 'integer', dataPath: 'e' },
    });
    expect(
      within(screen.getByTestId('field-end')).getByLabelText('Duplicate field name')
    ).toBeInTheDocument();
  });

  it('falls back to the name settled when you last left the input', () => {
    renderEditor(ONE_FIELD);
    const input = screen.getByTestId('fieldname-id');
    fireEvent.change(input, { target: { value: 'user_id' } });
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: '' } });

    expect(storedFields()).toEqual({ user_id: { type: 'string' } });
  });

  it('writes a waiting name when leaving another input frees it, and falls back to it', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{},"fields":{"a":{"type":"string"}}}}}');
    addField('a');
    const [first, second] = screen.getAllByRole('textbox', { name: 'Field name' });
    fireEvent.change(first, { target: { value: 'z' } });
    expect(storedFields()).toEqual({ z: { type: 'string' } });

    fireEvent.blur(first);
    expect(storedFields()).toEqual({ z: { type: 'string' }, a: { type: 'string' } });
    expect(screen.queryByLabelText('Duplicate field name')).toBeNull();

    fireEvent.change(second, { target: { value: '' } });
    expect(storedFields()).toEqual({ z: { type: 'string' }, a: { type: 'string' } });
  });

  it('writes each waiting name that removing a row frees, and falls back to it', () => {
    renderEditor(
      '{"nodes":{"items":{"recordSelector":{},"fields":{"a":{"type":"string"},"b":{"type":"integer"},"c":{"type":"boolean"}}}}}'
    );
    const b = screen.getByTestId('fieldname-b');
    const c = screen.getByTestId('fieldname-c');
    fireEvent.change(b, { target: { value: 'a' } });
    fireEvent.blur(b);
    fireEvent.change(c, { target: { value: 'b' } });
    fireEvent.blur(c);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove field a' })[0]);

    expect(storedFields()).toEqual({ a: { type: 'integer' }, b: { type: 'boolean' } });
    expect(screen.queryByLabelText('Duplicate field name')).toBeNull();

    fireEvent.change(c, { target: { value: '' } });
    expect(storedFields()).toEqual({ a: { type: 'integer' }, b: { type: 'boolean' } });
  });

  it('adds no field for a new row that is typed and then cleared', () => {
    renderEditor('{"nodes":{"items":{"recordSelector":{}}}}');
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    const input = screen.getByRole('textbox', { name: 'Field name' });
    fireEvent.change(input, { target: { value: 'foo' } });
    fireEvent.change(input, { target: { value: '' } });

    expect(storedFields()).toEqual({});
  });
});

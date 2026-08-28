import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Children, isValidElement, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { BigQuerySchemaField } from '../../../../shared/types/data-mart-schema.types';
import {
  BigQueryFieldMode,
  BigQueryFieldType,
  DataMartSchemaFieldStatus,
} from '../../../../shared/types/data-mart-schema.types';
import { BigQuerySchemaTable } from './BigQuerySchemaTable';
import type { SchemaToolbar } from '../types/schema-toolbar';

// SchemaTable uses useOutletContext for schema-actualization loading state
vi.mock('react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router')>();
  return {
    ...actual,
    useOutletContext: vi.fn(() => ({ isSchemaActualizationLoading: false })),
  };
});

vi.mock('@monaco-editor/react', () => ({
  Editor: (props: {
    value?: string;
    onChange?: (value: string | undefined) => void;
    onMount?: (editor: unknown, monaco: unknown) => void;
  }) => {
    useEffect(() => {
      props.onMount?.(
        {
          // The real editor focuses itself on mount: the popover's autofocus ran before Monaco
          // finished loading and would otherwise leave the caret on Cancel.
          focus: () => undefined,
          onDidDispose: () => undefined,
          // Registered once on mount; the formula editor binds Ctrl/Cmd+Enter to Apply through it.
          addCommand: () => undefined,
          getModel: () => ({}),
          // Chip-blind: nothing here is about chips, and their own specs cover both halves.
          createDecorationsCollection: () => ({ set: () => [], getRanges: () => [] }),
          onKeyDown: () => ({ dispose: () => undefined }),
          onDidChangeCursorSelection: () => ({ dispose: () => undefined }),
          onMouseDown: () => ({ dispose: () => undefined }),
          onMouseUp: () => ({ dispose: () => undefined }),
        },
        {
          languages: {
            CompletionItemKind: { Field: 4 },
            registerCompletionItemProvider: () => ({ dispose: () => undefined }),
            registerHoverProvider: () => ({ dispose: () => undefined }),
          },
          // The formula editor annotates the model with the live check's verdict.
          editor: { setModelMarkers: () => undefined },
          MarkerSeverity: { Error: 8, Warning: 4 },
          KeyMod: { CtrlCmd: 2048 },
          KeyCode: { Enter: 3 },
        }
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
      <textarea
        aria-label='Formula'
        data-testid='formula-editor'
        value={props.value ?? ''}
        onChange={e => {
          props.onChange?.(e.target.value);
        }}
      />
    );
  },
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));

vi.mock('@owox/ui/components/select', () => {
  const triggerLabel = (children: ReactNode): string | undefined => {
    let label: string | undefined;
    Children.forEach(children, child => {
      if (isValidElement(child)) {
        const ariaLabel = (child.props as Record<string, unknown>)['aria-label'];
        if (typeof ariaLabel === 'string') label ??= ariaLabel;
      }
    });
    return label;
  };
  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value: string;
      onValueChange?: (value: string) => void;
      children?: ReactNode;
    }) => (
      <select
        aria-label={triggerLabel(children)}
        value={value}
        onChange={e => {
          onValueChange?.(e.target.value);
        }}
      >
        {children}
      </select>
    ),
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: { children?: ReactNode }) => children,
    SelectItem: ({ value, children }: { value: string; children?: ReactNode }) => (
      <option value={value}>{children}</option>
    ),
  };
});

const mockSchemaToolbar: SchemaToolbar = {
  showAiHelper: false,
  refresh: { disabled: false, onClick: vi.fn() },
  ai: {
    disabled: false,
    loading: { metadata: false, aliases: false, descriptions: false },
    onGenerateMetadata: vi.fn(),
    onGenerateDescriptions: vi.fn(),
    onGenerateAliases: vi.fn(),
  },
};

function buildIdField(): BigQuerySchemaField {
  return {
    name: 'id',
    type: BigQueryFieldType.STRING,
    mode: BigQueryFieldMode.NULLABLE,
    isPrimaryKey: true,
    status: DataMartSchemaFieldStatus.CONNECTED,
  };
}

// A RECORD with a nested field — proves editing the (later, top-level) calculated field never
// mistranslates its flattened row index into this subtree, whether the record is collapsed or
// (IMPORTANT 2) expanded, which is the state where a naive flattened-array splice actually
// promotes the nested child to a bogus top-level entry.
function buildPayloadField(): BigQuerySchemaField {
  return {
    name: 'payload',
    type: BigQueryFieldType.RECORD,
    mode: BigQueryFieldMode.NULLABLE,
    isPrimaryKey: false,
    status: DataMartSchemaFieldStatus.CONNECTED,
    fields: [
      {
        name: 'value',
        type: BigQueryFieldType.STRING,
        mode: BigQueryFieldMode.NULLABLE,
        isPrimaryKey: false,
        status: DataMartSchemaFieldStatus.CONNECTED,
      },
    ],
  };
}

function buildCtrField(): BigQuerySchemaField {
  return {
    name: 'ctr',
    type: BigQueryFieldType.FLOAT,
    mode: BigQueryFieldMode.NULLABLE,
    isPrimaryKey: false,
    status: DataMartSchemaFieldStatus.CONNECTED,
    calculated: { formula: 'SUM({{ref field="id"}})', level: 'metric' },
  };
}

/**
 * The formula cell showing `text`, optionally scoped to one row. Found by the hover-card slot the
 * cell wraps itself in and then by its text: a resolved reference renders as its own chip span, so
 * the formula is several text nodes and `getByText` matches none.
 */
function formulaCell(text: string, scope: ParentNode = document): HTMLElement {
  const cells = [...scope.querySelectorAll<HTMLElement>('[data-slot="hover-card-trigger"]')];
  const cell = cells.find(candidate => candidate.textContent === text);
  if (!cell) throw new Error(`no formula cell showing "${text}"`);
  return cell;
}

/**
 * The formula cell's clickable trigger.
 */
function formulaTrigger(text: string): HTMLElement {
  const cell = formulaCell(text);
  return cell.querySelector<HTMLElement>('[data-slot="popover-trigger"]') ?? cell;
}

describe('BigQuerySchemaTable — calculated field (flattened-index correctness)', () => {
  it('a calculated row shows no Mode control — its formula spans that cell, PK and Σ available instead', () => {
    render(
      <BigQuerySchemaTable
        fields={[buildIdField(), buildPayloadField(), buildCtrField()]}
        onFieldsChange={() => {}}
        schemaToolbar={mockSchemaToolbar}
      />
    );
    const row = screen.getAllByRole('row').at(-1);
    expect(row).toBeDefined();
    if (!row) throw new Error('unreachable');
    expect(row.textContent).not.toMatch(/NULLABLE|REQUIRED|REPEATED/);

    // Mode + PK + Σ available: three columns that describe a warehouse column, none of which a
    // calculated field has.
    expect(formulaCell('SUM(id)').closest('td')).toHaveAttribute('colspan', '3');
  });

  it('a ROW-LEVEL row’s formula stops one column short — Σ available is its own', () => {
    const rowLevel: BigQuerySchemaField = {
      ...buildIdField(),
      name: 'doubled_id',
      calculated: { formula: '{{ref field="id"}} * 2', level: 'column' },
    };
    render(
      <BigQuerySchemaTable
        fields={[buildIdField(), buildCtrField(), rowLevel]}
        onFieldsChange={() => {}}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    // Mode + PK only. The metric beside it keeps all three, so this table renders two bands of
    // DIFFERENT lengths at once — what `RowCellSpan` had to grow to express.
    expect(formulaCell('id * 2').closest('td')).toHaveAttribute('colspan', '2');
    expect(formulaCell('SUM(id)').closest('td')).toHaveAttribute('colspan', '3');

    const row = screen.getByRole('row', { name: /doubled_id/ });
    expect(within(row).getByLabelText('Aggregations for doubled_id')).toBeInTheDocument();
    // Mode is still suppressed: a calculated field of either level owns no warehouse column.
    expect(row.textContent).not.toMatch(/NULLABLE|REQUIRED|REPEATED/);
  });

  it('a table with no calculated-field action still renders "Add Field" alone as the whole bottom row', () => {
    // BigQuery always passes `onAddRow`, so without `onFieldsChange` the bottom row holds exactly
    // one button — the case that must keep looking the way it did before the row was split.
    render(<BigQuerySchemaTable fields={[buildIdField()]} schemaToolbar={mockSchemaToolbar} />);

    // The toolbar above the table carries "Add Field" too; the bottom row's is the last one.
    const addField = screen.getAllByRole('button', { name: 'Add new field' }).at(-1);
    expect(screen.queryByRole('button', { name: 'Add calculated field' })).not.toBeInTheDocument();
    expect(addField?.parentElement?.children).toHaveLength(1);
    // `flex-1` on the only child still fills the row; happy-dom has no layout to measure.
    expect(addField?.className).toMatch(/(^|\s)flex-1(\s|$)/);
    // …and it keeps BOTH bottom corners. The inner one is squared only where the two halves meet,
    // so squaring it unconditionally would flatten a corner of the card on every such table.
    expect(addField?.className).not.toMatch(/(^|\s)rounded-br-none(\s|$)/);
  });

  it('editing an existing calculated field updates only it, leaving the RECORD field and its nested children untouched', () => {
    const onFieldsChange = vi.fn();
    const idField = buildIdField();
    const payloadField = buildPayloadField();
    // Deep clones taken BEFORE render/interaction: `updated[0]`/`updated[1]` below are, if nothing
    // is broken, the SAME object references as `idField`/`payloadField` (untouched entries survive
    // `[...fields]`'s shallow copy unchanged) — comparing against the live variables would compare
    // an object to itself and could never catch an in-place mutation. Comparing against a snapshot
    // taken beforehand can.
    const idFieldBefore = structuredClone(idField);
    const payloadFieldBefore = structuredClone(payloadField);

    render(
      <BigQuerySchemaTable
        fields={[idField, payloadField, buildCtrField()]}
        onFieldsChange={onFieldsChange}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    fireEvent.click(formulaTrigger('SUM(id)'));
    fireEvent.change(screen.getByTestId('formula-editor'), { target: { value: 'SUM(id) * 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onFieldsChange).toHaveBeenCalledTimes(1);
    const [updated] = onFieldsChange.mock.calls[0] as [BigQuerySchemaField[]];
    // Exactly the original three top-level fields — no flattened duplicate slipped in.
    expect(updated).toHaveLength(3);
    expect(updated[0]).toEqual(idFieldBefore);
    expect(updated[1]).toEqual(payloadFieldBefore);
    expect(updated[1].fields).toHaveLength(1);
    expect(updated[1].fields?.[0].name).toBe('value');
    expect(updated[2]).toMatchObject({
      name: 'ctr',
      calculated: { formula: 'SUM({{ref field="id"}}) * 2' },
    });
    // IMPORTANT: the saved field is built from the FLATTENED row BaseSchemaTable renders, which
    // carries `path`/`level` bookkeeping keys (useRecordExpansion). Those must never reach the
    // true schema field that gets PUT to the backend.
    expect(updated[2]).not.toHaveProperty('path');
    expect(updated[2]).not.toHaveProperty('level');
  });

  it('"Add Calculated Field" appends a genuine top-level field to the TRUE schema, not the flattened row list', () => {
    const onFieldsChange = vi.fn();
    const idField = buildIdField();
    const payloadField = buildPayloadField();
    const idFieldBefore = structuredClone(idField);
    const payloadFieldBefore = structuredClone(payloadField);

    render(
      <BigQuerySchemaTable
        fields={[idField, payloadField]}
        onFieldsChange={onFieldsChange}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Add calculated field' })[0]);

    expect(onFieldsChange).toHaveBeenCalledTimes(1);
    const [updated] = onFieldsChange.mock.calls[0] as [BigQuerySchemaField[]];
    expect(updated).toHaveLength(3);
    expect(updated[0]).toEqual(idFieldBefore);
    expect(updated[1]).toEqual(payloadFieldBefore);
    expect(updated[2]).toMatchObject({
      name: '',
      isPrimaryKey: false,
      calculated: { formula: '' },
    });
    // The level is DERIVED by the save from the formula. A client-chosen one would be a claim the
    // backend overwrites, so this client must not send one at all.
    expect(updated[2].calculated).not.toHaveProperty('level');
    // Merged in from createNewField()'s BigQuery defaults — required by the type, meaningless for
    // a calculated field, but must still be a legal value rather than left undefined.
    expect(updated[2].mode).toBe(BigQueryFieldMode.NULLABLE);
    expect(updated[2]).not.toHaveProperty('path');
    expect(updated[2]).not.toHaveProperty('level');
  });

  it('with the RECORD expanded, editing the calculated field leaves the true array 3 long and the nested child still nested (not promoted to a 4th top-level field)', () => {
    const onFieldsChange = vi.fn();
    const idField = buildIdField();
    const payloadField = buildPayloadField();
    const idFieldBefore = structuredClone(idField);
    const payloadFieldBefore = structuredClone(payloadField);

    render(
      <BigQuerySchemaTable
        fields={[idField, payloadField, buildCtrField()]}
        onFieldsChange={onFieldsChange}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    // Expand `payload` — flattenedFields (BaseSchemaTable's `fields` prop for this table) now has
    // 4 rows (id, payload, payload.value, ctr), one more than the true 3-field schema. This is the
    // state IMPORTANT 2 requires: a naive splice against the flattened array's length/positions
    // would append or index against 4, not 3, and would promote `value` to a spurious top-level row.
    fireEvent.click(screen.getByRole('button', { name: 'Expand nested fields' }));
    expect(screen.getAllByRole('row')).toHaveLength(1 + 4); // header + 4 data rows

    fireEvent.click(formulaTrigger('SUM(id)'));
    fireEvent.change(screen.getByTestId('formula-editor'), { target: { value: 'SUM(id) * 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onFieldsChange).toHaveBeenCalledTimes(1);
    const [updated] = onFieldsChange.mock.calls[0] as [BigQuerySchemaField[]];
    expect(updated).toHaveLength(3);
    expect(updated[0]).toEqual(idFieldBefore);
    expect(updated[1]).toEqual(payloadFieldBefore);
    // The nested child is still nested inside its parent — not promoted to a 4th top-level field.
    expect(updated[1].fields).toHaveLength(1);
    expect(updated[1].fields?.[0].name).toBe('value');
    expect(updated.map(f => f.name)).toEqual(['id', 'payload', 'ctr']);
    expect(updated[2]).toMatchObject({
      name: 'ctr',
      calculated: { formula: 'SUM({{ref field="id"}}) * 2' },
    });
  });
});

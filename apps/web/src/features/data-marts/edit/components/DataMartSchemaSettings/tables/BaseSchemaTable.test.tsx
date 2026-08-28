import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { Children, isValidElement, useEffect } from 'react';
import type { ReactNode } from 'react';
import type {
  AthenaSchemaField,
  BigQuerySchemaField,
} from '../../../../shared/types/data-mart-schema.types';
import {
  AthenaFieldType,
  BigQueryFieldMode,
  BigQueryFieldType,
  DataMartSchemaFieldStatus,
} from '../../../../shared/types/data-mart-schema.types';
import { AthenaSchemaTable } from './AthenaSchemaTable';
import { BigQuerySchemaTable } from './BigQuerySchemaTable';
import { DataStorageType } from '../../../../../data-storage';
import { scalarFunctionsFor } from '../calculated/formula-scalar-functions';
import type { SchemaToolbar } from '../types/schema-toolbar';
import { JoinedFormulaFieldsContext } from '../calculated/joined-fields-context';
import { CalculatedFieldIssuesContext } from '../calculated/calculated-field-issues-context';
import { FormulaDataMartIdContext } from '../calculated/formula-data-mart-context';
import { FORMULA_DIAGNOSTICS_DEBOUNCE_MS } from '../calculated/useFormulaDiagnostics';
import { dataMartService } from '../../../../shared/services/data-mart.service';

// The formula editor's live check. Mocked here because this table is what feeds it the row's own
// name and type — the wiring these tests are for; a real call would hit the network.
vi.mock('../../../../shared/services/data-mart.service', () => ({
  dataMartService: { validateFormula: vi.fn() },
}));

const validateFormula = vi.mocked(dataMartService.validateFormula);

// SchemaTable uses useOutletContext for schema-actualization loading state
vi.mock('react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router')>();
  return {
    ...actual,
    useOutletContext: vi.fn(() => ({ isSchemaActualizationLoading: false })),
  };
});

// vi.mock factories are hoisted above this file's own top-level statements, so state the mock
// shares with the tests has to live in vi.hoisted.
// `model` is the editor's OWN model, stable across `getModel()` calls: the completion provider
// answers only for that one, so a fresh object per call would read as another editor's.
const monacoState = vi.hoisted(() => ({
  registeredProvider: null as unknown,
  model: { getValueInRange: () => '' },
}));

// A calculated row's formula cell renders a FormulaEditor, which pulls in Monaco — happy-dom
// cannot run its web workers. Mocked defensively here the same way
// CalculatedFieldFormulaCell.test.tsx does, even for tests that never open the editor, since the
// import graph loads the real module either way. The completion provider is captured (with the
// real monaco enum values) so the suggestions this table actually feeds the editor can be read
// back — that wiring is what "the analyst sees the dialect's functions" comes down to.
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
          getModel: () => monacoState.model,
          // Chip-blind: nothing here is about chips, and their own specs cover both halves.
          createDecorationsCollection: () => ({ set: () => [], getRanges: () => [] }),
          onKeyDown: () => ({ dispose: () => undefined }),
          onDidChangeCursorSelection: () => ({ dispose: () => undefined }),
          onMouseDown: () => ({ dispose: () => undefined }),
          onMouseUp: () => ({ dispose: () => undefined }),
        },
        {
          languages: {
            CompletionItemKind: { Field: 4, Function: 1, Snippet: 27 },
            CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
            registerCompletionItemProvider: (_languageId: string, provider: unknown) => {
              monacoState.registeredProvider = provider;
              return { dispose: () => undefined };
            },
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

interface CompletionItemLike {
  label: string | { label: string; detail?: string; description?: string };
  detail?: string;
  insertText?: string;
}

/** What the editor mounted by the currently open formula popover would offer. */
function offeredCompletions(): CompletionItemLike[] {
  const provider = monacoState.registeredProvider as {
    provideCompletionItems: (
      model: { getValueInRange: () => string },
      position: { lineNumber: number; column: number }
    ) => { suggestions: CompletionItemLike[] };
  } | null;
  if (!provider) return [];
  return provider.provideCompletionItems(monacoState.model, { lineNumber: 1, column: 1 })
    .suggestions;
}

const completionNameOf = (item: CompletionItemLike): string =>
  typeof item.label === 'string' ? item.label : item.label.label;

vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));

// Radix Select needs pointer-capture/ResizeObserver APIs jsdom lacks — replaced with a native
// <select> the same way CalculatedFieldDialog.test.tsx and DataMartRelationshipsContent.test.tsx
// do, reading the accessible name off the child carrying an aria-label.
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

  refresh: {
    disabled: false,
    onClick: vi.fn(),
  },

  ai: {
    disabled: false,
    loading: {
      metadata: false,
      aliases: false,
      descriptions: false,
    },
    onGenerateMetadata: vi.fn(),
    onGenerateDescriptions: vi.fn(),
    onGenerateAliases: vi.fn(),
  },
};

function buildAthenaField(overrides: Partial<AthenaSchemaField> = {}): AthenaSchemaField {
  return {
    name: 'field_a',
    type: AthenaFieldType.STRING,
    isPrimaryKey: false,
    status: DataMartSchemaFieldStatus.CONNECTED,
    ...overrides,
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

describe('BaseSchemaTable — Aggregations column', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the "Available aggregations" column header (Σ icon with aria-label)', () => {
    const fields = [buildAthenaField()];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={() => {}}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    expect(screen.getByLabelText('Available aggregations')).toBeInTheDocument();
  });

  it('shows "4 selected" for a STRING field with no allowedAggregations (default: COUNT, COUNT_DISTINCT, STRING_AGG, ANY_VALUE)', () => {
    const fields = [buildAthenaField({ name: 'my_string', type: AthenaFieldType.STRING })];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={() => {}}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    expect(screen.getByText('4 selected')).toBeInTheDocument();
  });

  it('shows "4 selected" for a numeric field with no allowedAggregations (type-derived default: SUM, AVG, MIN, MAX)', () => {
    const fields = [buildAthenaField({ name: 'revenue', type: AthenaFieldType.DOUBLE })];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={() => {}}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    // DOUBLE numeric default is [SUM, AVG, MIN, MAX] — 4 items → "4 selected".
    expect(screen.getByText('4 selected')).toBeInTheDocument();
  });

  it('shows "COUNT" when field has explicit allowedAggregations: [COUNT]', () => {
    const fields = [buildAthenaField({ name: 'field_a', allowedAggregations: ['COUNT'] })];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={() => {}}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    expect(screen.getByText('COUNT')).toBeInTheDocument();
  });

  it('shows "None" when field has explicit allowedAggregations: []', () => {
    const fields = [buildAthenaField({ name: 'field_a', allowedAggregations: [] })];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={() => {}}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('toggling a function OFF calls onFieldsChange with narrowed allowedAggregations array', async () => {
    const onFieldsChange = vi.fn();
    // STRING default is [COUNT, COUNT_DISTINCT, STRING_AGG, ANY_VALUE] — all checked by default.
    const fields = [buildAthenaField({ name: 'my_string', type: AthenaFieldType.STRING })];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={onFieldsChange}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    // Open the aggregations dropdown for the field
    const trigger = screen.getByRole('button', { name: 'Aggregations for my_string' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    // COUNT_DISTINCT is checked — uncheck it
    const countDistinctItem = await within(document.body).findByRole('menuitemcheckbox', {
      name: 'COUNT_DISTINCT',
    });
    fireEvent.click(countDistinctItem);

    await waitFor(() => {
      expect(onFieldsChange).toHaveBeenCalled();
    });

    const [updatedFields] = onFieldsChange.mock.calls[0] as [AthenaSchemaField[]];
    expect(updatedFields[0].allowedAggregations).toEqual(['ANY_VALUE', 'COUNT', 'STRING_AGG']);
  });

  it('clearing all aggregations writes an explicit empty array [] (not dropped)', async () => {
    const onFieldsChange = vi.fn();
    const fields = [buildAthenaField({ name: 'field_a', allowedAggregations: ['COUNT'] })];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={onFieldsChange}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Aggregations for field_a' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    // COUNT is the only checked item — uncheck it to clear all
    const countItem = await within(document.body).findByRole('menuitemcheckbox', { name: 'COUNT' });
    fireEvent.click(countItem);

    await waitFor(() => {
      expect(onFieldsChange).toHaveBeenCalled();
    });

    const [updatedFields] = onFieldsChange.mock.calls[0] as [AthenaSchemaField[]];
    // Must persist explicit [] — not undefined, not omitted
    expect(updatedFields[0]).toHaveProperty('allowedAggregations');
    expect(updatedFields[0].allowedAggregations).toEqual([]);
  });

  it('turning a function ON calls onFieldsChange with that function added', async () => {
    const onFieldsChange = vi.fn();
    const fields = [buildAthenaField({ name: 'field_a', allowedAggregations: ['COUNT'] })];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={onFieldsChange}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Aggregations for field_a' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    // MIN is unchecked — click it to add it
    const minItem = await within(document.body).findByRole('menuitemcheckbox', { name: 'MIN' });
    fireEvent.click(minItem);

    await waitFor(() => {
      expect(onFieldsChange).toHaveBeenCalled();
    });

    const [updatedFields] = onFieldsChange.mock.calls[0] as [AthenaSchemaField[]];
    expect(updatedFields[0].allowedAggregations).toContain('MIN');
    expect(updatedFields[0].allowedAggregations).toContain('COUNT');
  });
});

it('renders AI header buttons when AI helper is enabled', () => {
  const fields = [buildAthenaField()];

  render(
    <AthenaSchemaTable
      fields={fields}
      onFieldsChange={() => {}}
      schemaToolbar={{
        ...mockSchemaToolbar,
        showAiHelper: true,
      }}
    />
  );

  expect(screen.getByLabelText('Generate field aliases')).toBeInTheDocument();

  expect(screen.getByLabelText('Generate field descriptions')).toBeInTheDocument();
});

it('hides AI header buttons when AI helper is disabled', () => {
  const fields = [buildAthenaField()];

  render(
    <AthenaSchemaTable
      fields={fields}
      onFieldsChange={() => {}}
      schemaToolbar={{
        ...mockSchemaToolbar,
        showAiHelper: false,
      }}
    />
  );

  expect(screen.queryByLabelText('Generate field aliases')).not.toBeInTheDocument();

  expect(screen.queryByLabelText('Generate field descriptions')).not.toBeInTheDocument();
});

it('calls AI callbacks when header buttons are clicked', () => {
  const onGenerateAliases = vi.fn();
  const onGenerateDescriptions = vi.fn();

  const fields = [buildAthenaField()];

  render(
    <AthenaSchemaTable
      fields={fields}
      onFieldsChange={() => {}}
      schemaToolbar={{
        ...mockSchemaToolbar,
        showAiHelper: true,
        ai: {
          ...mockSchemaToolbar.ai,
          onGenerateAliases,
          onGenerateDescriptions,
        },
      }}
    />
  );

  fireEvent.click(screen.getByLabelText('Generate field aliases'));

  expect(onGenerateAliases).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByLabelText('Generate field descriptions'));

  expect(onGenerateDescriptions).toHaveBeenCalledTimes(1);
});

describe('BaseSchemaTable — calculated field row', () => {
  function buildCalculatedField(overrides: Partial<AthenaSchemaField> = {}): AthenaSchemaField {
    return buildAthenaField({
      name: 'ctr',
      type: AthenaFieldType.DOUBLE,
      calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
      ...overrides,
    });
  }

  function buildBigQueryField(name: string): BigQuerySchemaField {
    return {
      name,
      type: BigQueryFieldType.INTEGER,
      mode: BigQueryFieldMode.NULLABLE,
      isPrimaryKey: false,
      status: DataMartSchemaFieldStatus.CONNECTED,
    };
  }

  function buildBigQueryCalculatedField(): BigQuerySchemaField {
    return {
      ...buildBigQueryField('ctr'),
      type: BigQueryFieldType.FLOAT,
      calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
    };
  }

  it('a calculated row offers no primary key and no aggregation control', () => {
    const fields = [buildAthenaField({ name: 'clicks' }), buildCalculatedField()];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={() => {}}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    const row = screen.getByRole('row', { name: /ctr/ });
    expect(within(row).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(row).queryByLabelText(/aggregation/i)).not.toBeInTheDocument();
  });

  it('a regular row still offers a primary key checkbox and aggregation control', () => {
    const fields = [buildAthenaField({ name: 'clicks' }), buildCalculatedField()];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={() => {}}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    // Not `getByRole('row', { name: /clicks/ })`: the calculated row's own accessible name also
    // matches — its formula preview reads "SUM(clicks)". Rows render in `fields` order (header
    // first), so index 1 is deterministically the "clicks" field's own row.
    const row = screen.getAllByRole('row')[1];
    expect(within(row).getByRole('checkbox')).toBeInTheDocument();
    expect(within(row).getByLabelText(/aggregation/i)).toBeInTheDocument();
  });

  it('renders the formula in authoring form in the row, never a stored tag', () => {
    const fields = [buildAthenaField({ name: 'clicks' }), buildCalculatedField()];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={() => {}}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    const row = screen.getByRole('row', { name: /ctr/ });
    expect(formulaCell('SUM(clicks)', row).textContent).toBe('SUM(clicks)');
    expect(within(row).queryByText(/\{\{/)).not.toBeInTheDocument();
  });

  it('the formula spans PK and Σ available on a storage with no Mode column', () => {
    const fields = [buildAthenaField({ name: 'clicks' }), buildCalculatedField()];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={() => {}}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    // Athena has no Mode column, so the band between Type and Σ available is those two columns.
    expect(formulaCell('SUM(clicks)').closest('td')).toHaveAttribute('colspan', '2');
  });

  it('renders the ƒ icon on a calculated row and the ordinary status icon on a normal one', () => {
    const fields = [buildAthenaField({ name: 'clicks' }), buildCalculatedField()];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={() => {}}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    const calculatedRow = screen.getByRole('row', { name: /ctr/ });
    expect(
      within(calculatedRow).getByRole('img', { name: 'Calculated field' })
    ).toBeInTheDocument();
    expect(within(calculatedRow).queryByRole('img', { name: 'Connected' })).not.toBeInTheDocument();

    // Rows render in `fields` order (header first), so index 1 is the "clicks" field's own row.
    const regularRow = screen.getAllByRole('row')[1];
    expect(within(regularRow).getByRole('img', { name: 'Connected' })).toBeInTheDocument();
    expect(
      within(regularRow).queryByRole('img', { name: 'Calculated field' })
    ).not.toBeInTheDocument();
  });

  it('the ƒ icon is green while the metric resolves', () => {
    const fields = [buildAthenaField({ name: 'clicks' }), buildCalculatedField()];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={() => {}}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    const icon = screen.getByRole('img', { name: 'Calculated field' });
    expect(icon.className).toMatch(/text-green-500/);
    expect(icon.className).not.toMatch(/text-red-500/);
  });

  it('the ƒ icon is red and names the missing field when the backend reports the metric broken', async () => {
    const fields = [buildAthenaField({ name: 'clicks' }), buildCalculatedField()];
    render(
      <CalculatedFieldIssuesContext.Provider value={new Map([['ctr', ['impressions']]])}>
        <AthenaSchemaTable
          fields={fields}
          onFieldsChange={() => {}}
          schemaToolbar={mockSchemaToolbar}
        />
      </CalculatedFieldIssuesContext.Provider>
    );

    const icon = screen.getByRole('img', { name: 'Calculated field with a broken reference' });
    expect(icon.className).toMatch(/text-red-500/);

    fireEvent.focusIn(icon);
    // Same sentence the report column picker shows for the same verdict (describeMissingReferences).
    expect(
      await screen.findByText(
        'This calculated field reads `impressions`, which is missing from the Data Mart, or broken.'
      )
    ).toBeInTheDocument();
  });

  it('leaves a metric the backend says nothing about, and an ordinary field, alone', () => {
    const fields = [buildAthenaField({ name: 'clicks' }), buildCalculatedField()];
    render(
      <CalculatedFieldIssuesContext.Provider value={new Map([['other_metric', ['gone']]])}>
        <AthenaSchemaTable
          fields={fields}
          onFieldsChange={() => {}}
          schemaToolbar={mockSchemaToolbar}
        />
      </CalculatedFieldIssuesContext.Provider>
    );

    expect(screen.getByRole('img', { name: 'Calculated field' })).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'Calculated field with a broken reference' })
    ).not.toBeInTheDocument();
    // The toolbar's status counts carry one too, hence the row-scoped query.
    const regularRow = screen.getAllByRole('row')[1];
    expect(within(regularRow).getByRole('img', { name: 'Connected' })).toBeInTheDocument();
  });

  it('a calculated row gets the declared-type dropdown, and changing it saves', () => {
    const onFieldsChange = vi.fn();
    const fields = [buildAthenaField({ name: 'clicks' }), buildCalculatedField()];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={onFieldsChange}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    const row = screen.getByRole('row', { name: /ctr/ });
    const typeSelect = within(row).getByRole('combobox');
    expect(typeSelect).toHaveValue(AthenaFieldType.DOUBLE);

    fireEvent.change(typeSelect, { target: { value: AthenaFieldType.FLOAT } });

    expect(onFieldsChange).toHaveBeenCalledTimes(1);
    const [updatedFields] = onFieldsChange.mock.calls[0] as [AthenaSchemaField[]];
    expect(updatedFields).toHaveLength(2);
    expect(updatedFields[1]).toMatchObject({
      name: 'ctr',
      type: AthenaFieldType.FLOAT,
      calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
    });
  });

  // The scalar list is per warehouse, and the storage type only exists this far up the tree — so
  // this is the only place the pairing can be checked end to end. Without it the curated Athena
  // list is a module nothing imports at runtime.
  /** Opens a calculated row's formula popover and reads back what the editor would offer. */
  function openFormulaAndReadScalars(): { scalars: string[]; aggregates: string[] } {
    fireEvent.click(formulaTrigger('SUM(clicks)'));
    const suggestions = offeredCompletions();
    return {
      scalars: suggestions
        .filter(s => s.detail === 'function')
        .map(completionNameOf)
        .sort(),
      aggregates: suggestions.filter(s => s.detail === 'aggregation').map(completionNameOf),
    };
  }

  it('feeds the editor the scalar functions of THIS table’s warehouse, alongside its aggregates', () => {
    monacoState.registeredProvider = null;
    render(
      <AthenaSchemaTable
        fields={[buildAthenaField({ name: 'clicks' }), buildCalculatedField()]}
        onFieldsChange={() => {}}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    const { scalars, aggregates } = openFormulaAndReadScalars();
    expect(scalars).toEqual(scalarFunctionsFor(DataStorageType.AWS_ATHENA));
    // Guard the guard: an empty list would satisfy the equality above only if the module also
    // returned nothing, which would hide exactly the regression this test is for.
    expect(scalars.length).toBeGreaterThan(0);
    // The aggregate group is unaffected — the scalar group is added beside it, not instead of it.
    expect(aggregates).toContain('SUM');
  });

  // A second warehouse, because the assertion above is also satisfied by a hard-coded
  // `scalarFunctionsFor(AWS_ATHENA)` in the table. Two storages whose lists differ are not.
  it('feeds a BigQuery table BigQuery’s list, not Athena’s', () => {
    monacoState.registeredProvider = null;
    render(
      <BigQuerySchemaTable
        fields={[buildBigQueryField('clicks'), buildBigQueryCalculatedField()]}
        onFieldsChange={() => {}}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    const { scalars } = openFormulaAndReadScalars();
    expect(scalars).toEqual(scalarFunctionsFor(DataStorageType.GOOGLE_BIGQUERY));
    expect(scalars).not.toEqual(scalarFunctionsFor(DataStorageType.AWS_ATHENA));
  });

  // The index is built HERE, from the table's own schema fields, so this is the only place that
  // pins a calculated field of the Data Mart reaching the menu at all.
  it('offers the table’s other calculated field to a formula, level and all', () => {
    monacoState.registeredProvider = null;
    render(
      <AthenaSchemaTable
        fields={[
          buildAthenaField({ name: 'clicks' }),
          buildCalculatedField(),
          buildCalculatedField({
            name: 'revenue',
            calculated: { formula: 'SUM({{ref field="clicks"}}) * 2', level: 'metric' },
          }),
        ]}
        onFieldsChange={() => {}}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    fireEvent.click(formulaTrigger('SUM(clicks)'));
    const offered = offeredCompletions();

    expect(offered.map(completionNameOf)).toContain('clicks');
    expect(offered.find(item => completionNameOf(item) === 'revenue')?.label).toMatchObject({
      description: 'aggregated formula',
    });
  });

  it('editing the formula in place replaces that metric, not appends a new field, and opens no modal', () => {
    const onFieldsChange = vi.fn();
    const fields = [buildAthenaField({ name: 'clicks' }), buildCalculatedField()];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={onFieldsChange}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    fireEvent.click(formulaTrigger('SUM(clicks)'));
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull();

    fireEvent.change(screen.getByTestId('formula-editor'), {
      target: { value: 'SUM(clicks) * 2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onFieldsChange).toHaveBeenCalledTimes(1);
    const [updatedFields] = onFieldsChange.mock.calls[0] as [AthenaSchemaField[]];
    expect(updatedFields).toHaveLength(2);
    expect(updatedFields[1]).toMatchObject({
      name: 'ctr',
      calculated: { formula: 'SUM({{ref field="clicks"}}) * 2' },
    });
    // The level rides along so the row does not change shape mid-edit; the save re-derives it.
    expect(updatedFields[1].calculated).toHaveProperty('level', 'metric');
  });

  // The cell cannot know either of these on its own: the Data Mart arrives by context, and the
  // name and type belong to the row. Wrong or missing, the live check either 400s or never runs,
  // and nothing else in the suite would notice.
  it('tells the live check which metric, of which Data Mart, is being edited', async () => {
    validateFormula.mockReset();
    validateFormula.mockResolvedValue({ errors: [], warnings: [] });
    vi.useFakeTimers();
    try {
      const metric = buildCalculatedField();
      render(
        <FormulaDataMartIdContext.Provider value='dm-1'>
          <AthenaSchemaTable
            fields={[buildAthenaField({ name: 'clicks' }), metric]}
            onFieldsChange={() => {}}
            schemaToolbar={mockSchemaToolbar}
          />
        </FormulaDataMartIdContext.Provider>
      );

      fireEvent.click(formulaTrigger('SUM(clicks)'));
      fireEvent.change(screen.getByTestId('formula-editor'), {
        target: { value: 'SUM(clicks) * 2' },
      });
      await act(async () => {
        vi.advanceTimersByTime(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
      });

      expect(validateFormula).toHaveBeenCalledWith(
        'dm-1',
        { name: 'ctr', type: metric.type, formula: 'SUM({{ref field="clicks"}}) * 2' },
        expect.anything()
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('an unresolvable identifier blocks the in-row save and names it', () => {
    const onFieldsChange = vi.fn();
    const fields = [buildAthenaField({ name: 'clicks' }), buildCalculatedField()];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={onFieldsChange}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    fireEvent.click(formulaTrigger('SUM(clicks)'));
    fireEvent.change(screen.getByTestId('formula-editor'), { target: { value: 'SUM(clickz)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onFieldsChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('clickz');
  });

  it('a joined name is not blamed on the analyst when the join tree failed to load', () => {
    const onFieldsChange = vi.fn();
    render(
      <JoinedFormulaFieldsContext.Provider value={{ status: 'unavailable', fields: [] }}>
        <AthenaSchemaTable
          fields={[buildAthenaField({ name: 'clicks' }), buildCalculatedField()]}
          onFieldsChange={onFieldsChange}
          schemaToolbar={mockSchemaToolbar}
        />
      </JoinedFormulaFieldsContext.Provider>
    );

    fireEvent.click(formulaTrigger('SUM(clicks)'));
    fireEvent.change(screen.getByTestId('formula-editor'), {
      target: { value: 'SUM(orders.amount)' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onFieldsChange).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/could not be checked against the joined Data Marts/);
    expect(alert).not.toHaveTextContent(/is not a field of this Data Mart/);
  });

  it('"Add Calculated Field" appends an empty field row to fill in', () => {
    const onFieldsChange = vi.fn();
    const fields = [buildAthenaField({ name: 'clicks' })];
    render(
      <AthenaSchemaTable
        fields={fields}
        onFieldsChange={onFieldsChange}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    // Two buttons trigger the same action — the toolbar's and the bottom row's; either does.
    fireEvent.click(screen.getAllByRole('button', { name: 'Add calculated field' })[0]);

    expect(onFieldsChange).toHaveBeenCalledTimes(1);
    const [updatedFields] = onFieldsChange.mock.calls[0] as [AthenaSchemaField[]];
    expect(updatedFields).toHaveLength(2);
    expect(updatedFields[1]).toMatchObject({
      name: '',
      isPrimaryKey: false,
      status: DataMartSchemaFieldStatus.CONNECTED,
      calculated: { formula: '' },
    });
    // The level is DERIVED by the save from the formula, so a new field must not carry a guess.
    expect(updatedFields[1].calculated).not.toHaveProperty('level');
  });

  // happy-dom has no layout, so the assertion is on the sizing rule rather than on the pixels it
  // produces: `w-full` here overflowed the row (Button's base class sets `shrink-0`, so neither
  // button gave any width back) and pushed "Add Calculated Field" out of the card. Verified in a
  // real browser as well — see the task report.
  it('the bottom row splits its width between both actions instead of overflowing', () => {
    render(
      <AthenaSchemaTable
        fields={[buildAthenaField({ name: 'clicks' })]}
        onFieldsChange={() => {}}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    // Last of each: the toolbar carries the same two actions above the table.
    const addField = screen.getAllByRole('button', { name: 'Add new field' }).at(-1);
    const addMetric = screen.getAllByRole('button', { name: 'Add calculated field' }).at(-1);
    expect(addField).toBeDefined();
    expect(addMetric).toBeDefined();
    expect(addField?.parentElement).toBe(addMetric?.parentElement);
    for (const button of [addField, addMetric]) {
      expect(button?.className).toMatch(/(^|\s)flex-1(\s|$)/);
      expect(button?.className).not.toMatch(/(^|\s)w-full(\s|$)/);
    }
  });

  // One footer, not two pills butted together: each half kept its own corner on the side they
  // meet, which notched the junction between them.
  it('squares only the corners where the two bottom actions meet', () => {
    render(
      <AthenaSchemaTable
        fields={[buildAthenaField({ name: 'clicks' })]}
        onFieldsChange={() => {}}
        schemaToolbar={mockSchemaToolbar}
      />
    );

    const addField = screen.getAllByRole('button', { name: 'Add new field' }).at(-1);
    const addCalculated = screen.getAllByRole('button', { name: 'Add calculated field' }).at(-1);

    expect(addField?.className).toMatch(/(^|\s)rounded-br-none(\s|$)/);
    expect(addCalculated?.className).toMatch(/(^|\s)rounded-bl-none(\s|$)/);
    // The OUTER corners of the footer row are untouched — only the junction was the complaint.
    expect(addField?.className).not.toMatch(/(^|\s)rounded-bl-none(\s|$)/);
    expect(addCalculated?.className).not.toMatch(/(^|\s)rounded-br-none(\s|$)/);
  });

  it('offers the joined fields published on the page, storing the reference with its path', () => {
    // The wiring this test exists for: the joined universe reaches the formula cell through
    // context, because the only path between the page and the cell runs through five per-storage
    // tables that have nothing to do with joins.
    const onFieldsChange = vi.fn();
    render(
      <JoinedFormulaFieldsContext.Provider
        value={{
          status: 'ready',
          fields: [
            {
              aliasPath: 'orders',
              originalFieldName: 'amount',
              type: 'DOUBLE',
              isHidden: false,
              outputPrefix: 'Orders',
            },
          ],
        }}
      >
        <AthenaSchemaTable
          fields={[buildAthenaField({ name: 'clicks' }), buildCalculatedField()]}
          onFieldsChange={onFieldsChange}
          schemaToolbar={mockSchemaToolbar}
        />
      </JoinedFormulaFieldsContext.Provider>
    );

    fireEvent.click(formulaTrigger('SUM(clicks)'));
    fireEvent.change(screen.getByTestId('formula-editor'), {
      target: { value: 'SUM(orders.amount)' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    const [updatedFields] = onFieldsChange.mock.calls[0] as [AthenaSchemaField[]];
    expect(updatedFields[1]).toMatchObject({
      calculated: { formula: 'SUM({{ref path="orders" field="amount"}})' },
    });
  });

  it('without onFieldsChange (read-only), the formula is plain text — not an editor whose Apply would silently vanish', () => {
    const fields = [buildAthenaField({ name: 'clicks' }), buildCalculatedField()];
    render(<AthenaSchemaTable fields={fields} schemaToolbar={mockSchemaToolbar} />);

    // No "Add Calculated Field" action either — mirrors "Add Field", both gated on onFieldsChange.
    expect(screen.queryByRole('button', { name: 'Add calculated field' })).not.toBeInTheDocument();

    const formula = formulaTrigger('SUM(clicks)');
    expect(formula.tagName).not.toBe('BUTTON');
    fireEvent.click(formula);
    expect(screen.queryByTestId('formula-editor')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // A ROW-LEVEL calculated field (`level: 'column'`), which the backend now derives from a
  // formula with no aggregate call. The level shows NOWHERE: every assertion below is
  // that this row looks exactly like a metric's. They are here so the two reasons stop being
  // confused with each other — one of them is permanent, the other is not.
  // -------------------------------------------------------------------------
  describe('a row-level calculated field', () => {
    const ROW_LEVEL_FORMULA = '{{ref field="clicks"}} * 2';
    const ROW_LEVEL_TEXT = 'clicks * 2';

    function buildRowLevelField(overrides: Partial<AthenaSchemaField> = {}): AthenaSchemaField {
      return buildAthenaField({
        name: 'doubled_clicks',
        type: AthenaFieldType.DOUBLE,
        calculated: { formula: ROW_LEVEL_FORMULA, level: 'column' },
        ...overrides,
      });
    }

    function renderRowLevel(): HTMLElement {
      render(
        <AthenaSchemaTable
          fields={[buildAthenaField({ name: 'clicks' }), buildRowLevelField()]}
          onFieldsChange={() => {}}
          schemaToolbar={mockSchemaToolbar}
        />
      );
      return screen.getByRole('row', { name: /doubled_clicks/ });
    }

    // PERMANENT, and for a reason that has nothing to do with aggregation: no calculated field
    // owns a warehouse column, so neither level can be part of the output Primary Key.
    it('offers no primary key checkbox — it has no warehouse column to key on', () => {
      const row = renderRowLevel();
      expect(within(row).queryByRole('checkbox')).not.toBeInTheDocument();
      // The contrast that keeps the assertion honest: the ordinary row above it does get one.
      expect(within(screen.getAllByRole('row')[1]).getByRole('checkbox')).toBeInTheDocument();
    });

    // A row-level field IS aggregatable, so it owns the "Σ available" cell
    // exactly like an ordinary column — that set is what a report's aggregation menu is drawn
    // from, and the backend now honours it for this level.
    it('owns the "Σ available" control, exactly like an ordinary column', () => {
      const row = renderRowLevel();
      expect(within(row).getByLabelText('Aggregations for doubled_clicks')).toBeInTheDocument();
      expect(
        within(screen.getAllByRole('row')[1]).getByLabelText(/aggregation/i)
      ).toBeInTheDocument();

      // WHERE the control comes from, because it is NOT where it looks. Relaxing the cell's own
      // `calculated` guard alone changes NOTHING: the formula band's wrapper answers first and
      // replaces the cell before that guard ever runs. The band has to END before this column for
      // a row-level row, and this span is that seam — on a storage with no Mode column the band
      // is now the PK cell alone, which spans nothing (SchemaTable omits `colspan` at 1).
      expect(formulaCell(ROW_LEVEL_TEXT, row).closest('td')).not.toHaveAttribute('colspan');
    });

    it('edits its own allowed set through that control, and the change is saved', async () => {
      const onFieldsChange = vi.fn();
      render(
        <AthenaSchemaTable
          fields={[buildAthenaField({ name: 'clicks' }), buildRowLevelField()]}
          onFieldsChange={onFieldsChange}
          schemaToolbar={mockSchemaToolbar}
        />
      );

      const trigger = screen.getByRole('button', { name: 'Aggregations for doubled_clicks' });
      fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

      // DOUBLE resolves to the number menu, whose default is [SUM, AVG, MIN, MAX]; ANY_VALUE is
      // supported by the type but off, so turning it on proves the cell edits THIS field's set
      // rather than merely rendering a type-derived default.
      const anyValue = await within(document.body).findByRole('menuitemcheckbox', {
        name: 'ANY_VALUE',
      });
      fireEvent.click(anyValue);

      await waitFor(() => {
        expect(onFieldsChange).toHaveBeenCalled();
      });
      const [updatedFields] = onFieldsChange.mock.calls[0] as [AthenaSchemaField[]];
      expect(updatedFields[1].allowedAggregations).toEqual([
        'SUM',
        'AVG',
        'MIN',
        'MAX',
        'ANY_VALUE',
      ]);
    });

    it('renders its formula in the same band a metric’s uses, one column shorter', () => {
      render(
        <AthenaSchemaTable
          fields={[
            buildAthenaField({ name: 'clicks' }),
            buildCalculatedField(),
            buildRowLevelField(),
          ]}
          onFieldsChange={() => {}}
          schemaToolbar={mockSchemaToolbar}
        />
      );

      const metricCell = formulaCell('SUM(clicks)');
      const rowLevelCell = formulaCell(ROW_LEVEL_TEXT);

      // Authoring form, never the stored tag — the same as a metric's.
      expect(rowLevelCell.textContent).toBe(ROW_LEVEL_TEXT);
      expect(screen.queryByText(/\{\{/)).not.toBeInTheDocument();

      // Two bands in ONE table, ending at different columns — the shape `RowCellSpan` could not
      // express before this slice. The metric's still runs through "Σ available"; the row-level
      // one stops before it and spans nothing at all on this storage.
      expect(rowLevelCell.closest('td')).not.toHaveAttribute('colspan');
      expect(metricCell.closest('td')).toHaveAttribute('colspan', '2');

      // …and the row-level row's own Σ cell is the real one, not the formula drawn a second time.
      const row = screen.getByRole('row', { name: /doubled_clicks/ });
      expect(
        [...row.querySelectorAll('[data-slot="hover-card-trigger"]')].filter(
          cell => cell.textContent === ROW_LEVEL_TEXT
        )
      ).toHaveLength(1);
      expect(within(row).getByLabelText('Aggregations for doubled_clicks')).toBeInTheDocument();
    });

    it('leaves an aggregate-level field’s band untouched — it is already an aggregate', () => {
      render(
        <AthenaSchemaTable
          fields={[buildAthenaField({ name: 'clicks' }), buildCalculatedField()]}
          onFieldsChange={() => {}}
          schemaToolbar={mockSchemaToolbar}
        />
      );

      const row = screen.getByRole('row', { name: /ctr/ });
      expect(within(row).queryByLabelText(/aggregation/i)).not.toBeInTheDocument();
      expect(formulaCell('SUM(clicks)', row).closest('td')).toHaveAttribute('colspan', '2');
    });

    // A field authored in this session carries no level yet (the save derives it), and the
    // aggregate reading is the one that offers nothing — so a new row must not flash a control
    // that the very next response could take away.
    it('a calculated field carrying NO level is read as an aggregate, not as row-level', () => {
      render(
        <AthenaSchemaTable
          fields={[
            buildAthenaField({ name: 'clicks' }),
            buildRowLevelField({ calculated: { formula: ROW_LEVEL_FORMULA } }),
          ]}
          onFieldsChange={() => {}}
          schemaToolbar={mockSchemaToolbar}
        />
      );

      const row = screen.getByRole('row', { name: /doubled_clicks/ });
      expect(within(row).queryByLabelText(/aggregation/i)).not.toBeInTheDocument();
      expect(formulaCell(ROW_LEVEL_TEXT, row).closest('td')).toHaveAttribute('colspan', '2');
    });

    it('carries the same ƒ status icon a metric does', () => {
      render(
        <AthenaSchemaTable
          fields={[
            buildAthenaField({ name: 'clicks' }),
            buildCalculatedField(),
            buildRowLevelField(),
          ]}
          onFieldsChange={() => {}}
          schemaToolbar={mockSchemaToolbar}
        />
      );

      const row = screen.getByRole('row', { name: /doubled_clicks/ });
      expect(within(row).getByRole('img', { name: 'Calculated field' })).toBeInTheDocument();
      expect(within(row).queryByRole('img', { name: 'Connected' })).not.toBeInTheDocument();
      // Both levels, one icon — nothing tells them apart on the row.
      expect(screen.getAllByRole('img', { name: 'Calculated field' })).toHaveLength(2);
    });

    // The level decides this row's SHAPE, and an absent one reads as aggregate — so dropping it
    // on every edit took "Σ available" off a dimension the moment its formula was touched, and
    // gave it back only after a save. It rides along instead; the save overwrites
    // `calculated.level` from its own analysis, so what is sent decides nothing.
    it('carries the stored level through an edit, and drops the warehouse stamp', () => {
      const onFieldsChange = vi.fn();
      render(
        <AthenaSchemaTable
          fields={[
            buildAthenaField({ name: 'clicks' }),
            {
              ...buildRowLevelField(),
              calculated: {
                formula: ROW_LEVEL_FORMULA,
                level: 'column',
                warehouseValidation: 'passed',
              },
            } as AthenaSchemaField,
          ]}
          onFieldsChange={onFieldsChange}
          schemaToolbar={mockSchemaToolbar}
        />
      );

      fireEvent.click(formulaTrigger(ROW_LEVEL_TEXT));
      fireEvent.change(screen.getByTestId('formula-editor'), {
        target: { value: 'SUM(clicks)' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

      const [updatedFields] = onFieldsChange.mock.calls[0] as [AthenaSchemaField[]];
      expect(updatedFields[1].calculated).toEqual({
        formula: 'SUM({{ref field="clicks"}})',
        level: 'column',
      });
    });

    it('keeps its Σ available control after its formula is edited, before any save', () => {
      const onFieldsChange = vi.fn();
      const fields = [buildAthenaField({ name: 'clicks' }), buildRowLevelField()];
      const { rerender } = render(
        <AthenaSchemaTable
          fields={fields}
          onFieldsChange={onFieldsChange}
          schemaToolbar={mockSchemaToolbar}
        />
      );

      fireEvent.click(formulaTrigger(ROW_LEVEL_TEXT));
      fireEvent.change(screen.getByTestId('formula-editor'), {
        target: { value: 'UPPER(clicks)' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

      const [updatedFields] = onFieldsChange.mock.calls[0] as [AthenaSchemaField[]];
      rerender(
        <AthenaSchemaTable
          fields={updatedFields}
          onFieldsChange={onFieldsChange}
          schemaToolbar={mockSchemaToolbar}
        />
      );

      const row = screen.getAllByRole('row')[2];
      expect(within(row).getByLabelText(/aggregation/i)).toBeInTheDocument();
    });
  });
});

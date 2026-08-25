import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { DataMartSchemaFieldStatus } from '../../../../shared/types/data-mart-schema.types';
import { CalculatedFieldFormulaCell } from './CalculatedFieldFormulaCell';
import {
  collectDraftCalculatedFields,
  DraftCalculatedFieldsContext,
} from './draft-calculated-fields';
import { aggregateFunctionsFor } from './formula-function-dialects';
import {
  buildJoinedReferenceIndex,
  buildReferenceIndex,
  type JoinedSchemaField,
  type SchemaField,
} from './formula-reference-index';
import type { JoinedFieldsStatus } from './joined-fields-context';
import { DataStorageType } from '../../../../../data-storage';
import { dataMartService } from '../../../../shared/services/data-mart.service';
import { FORMULA_DIAGNOSTICS_DEBOUNCE_MS } from './useFormulaDiagnostics';

const validateFormula = vi.mocked(dataMartService.validateFormula);

// Monaco pulls in web workers happy-dom cannot run — a controlled textarea standing in for the
// editor's `value`, so `formulaValue()` reads what the cell currently believes the authoring text
// is, and `typeFormula()` drives a change through exactly as FormulaEditor's onChange would (one
// full-text change, not a keystroke-by-keystroke simulation).
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
          // Chip-blind on purpose: nothing in this file is about chips, and a stub that draws
          // none keeps it that way. Their own specs cover both halves of the chip layer.
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

vi.mock('../../../../shared/services/data-mart.service', () => ({
  dataMartService: { validateFormula: vi.fn() },
}));

function field(overrides: Partial<SchemaField> = {}): SchemaField {
  return {
    name: 'f',
    type: 'STRING',
    isPrimaryKey: false,
    status: DataMartSchemaFieldStatus.CONNECTED,
    ...overrides,
  };
}

const fields = [
  field({ name: 'clicks', type: 'INTEGER' }),
  field({ name: 'impressions', type: 'INTEGER' }),
];

function joinedField(overrides: Partial<JoinedSchemaField> = {}): JoinedSchemaField {
  return {
    aliasPath: 'orders',
    originalFieldName: 'amount',
    type: 'FLOAT',
    isHidden: false,
    outputPrefix: 'Orders',
    ...overrides,
  };
}

const CTR_FORMULA = 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)';

interface CellOptions {
  formula?: string;
  own?: SchemaField[];
  joined?: JoinedSchemaField[];
  joinedFieldsStatus?: JoinedFieldsStatus;
  onSave?: (formula: string) => void;
  readOnly?: boolean;
  /** Identifies the metric to the live backend check; omitted, that check is simply off. */
  live?: boolean;
  /** The metric's own name, which titles the editor. Independent of the live check. */
  fieldName?: string;
}

function renderCell({
  formula = '',
  own = fields,
  joined = [],
  joinedFieldsStatus = 'ready',
  onSave = vi.fn(),
  readOnly = false,
  live = false,
  fieldName,
}: CellOptions = {}) {
  render(
    // The provider the schema page puts above every table: the live check has to be told what the
    // editor is HOLDING, or it resolves a sibling reference against the schema on disk.
    <DraftCalculatedFieldsContext.Provider value={collectDraftCalculatedFields(own)}>
      <CalculatedFieldFormulaCell
        formula={formula}
        index={[...buildReferenceIndex(own), ...buildJoinedReferenceIndex(joined)]}
        functionNames={aggregateFunctionsFor(DataStorageType.GOOGLE_BIGQUERY)}
        joinedFieldsStatus={joinedFieldsStatus}
        onSave={readOnly ? undefined : onSave}
        dataMartId={live ? 'dm-1' : undefined}
        fieldName={fieldName ?? (live ? 'ctr' : undefined)}
        fieldType={live ? 'FLOAT' : undefined}
      />
    </DraftCalculatedFieldsContext.Provider>
  );
  return onSave;
}

/**
 * The row showing `text`. Found by its title rather than its text because a resolved reference is
 * its own `<span>` chip now, so the formula is several text nodes and `getByText` matches none.
 */
function formulaRow(text: string): HTMLElement {
  // An empty formula shows the placeholder instead, which is one text node and carries no title.
  const row = screen.queryByTitle(text) ?? screen.getByText(text);
  return row.querySelector<HTMLElement>('[data-slot="popover-trigger"]') ?? row;
}

function openEditor(triggerText: string) {
  fireEvent.click(formulaRow(triggerText));
}

function formulaValue(): string {
  return screen.getByTestId<HTMLTextAreaElement>('formula-editor').value;
}

function typeFormula(text: string) {
  fireEvent.change(screen.getByTestId('formula-editor'), { target: { value: text } });
}

function apply() {
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
}

describe('CalculatedFieldFormulaCell', () => {
  it('shows the formula in authoring form, never a stored tag', () => {
    renderCell({ formula: CTR_FORMULA });

    expect(formulaRow('SUM(clicks) / NULLIF(SUM(impressions), 0)').textContent).toBe(
      'SUM(clicks) / NULLIF(SUM(impressions), 0)'
    );
    expect(screen.queryByText(/\{\{/)).not.toBeInTheDocument();
  });

  it('edits in a popover on the row — no modal dialog', () => {
    renderCell({ formula: CTR_FORMULA });

    expect(screen.queryByTestId('formula-editor')).not.toBeInTheDocument();
    openEditor('SUM(clicks) / NULLIF(SUM(impressions), 0)');

    expect(formulaValue()).toBe('SUM(clicks) / NULLIF(SUM(impressions), 0)');
    // A popover anchored to the cell, not a modal: Radix gives both `role="dialog"`, so the
    // distinction has to be read off the slot the editor actually sits in.
    expect(
      screen.getByTestId('formula-editor').closest('[data-slot="popover-content"]')
    ).not.toBeNull();
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull();
  });

  it('applies the edited formula in stored form, never showing a tag to the analyst', () => {
    const onSave = renderCell({ formula: 'SUM({{ref field="clicks"}})' });

    openEditor('SUM(clicks)');
    typeFormula('SUM(clicks) / NULLIF(SUM(impressions), 0)');
    apply();

    expect(onSave).toHaveBeenCalledWith(CTR_FORMULA);
    expect(screen.queryByText(/\{\{/)).not.toBeInTheDocument();
  });

  it('leaves an untouched reference byte-identical when another part of the formula is edited', () => {
    const onSave = renderCell({
      formula: 'SUM({{ref field="clicks"}}) + SUM({{ref path="orders" field="amount"}})',
      joined: [joinedField()],
    });

    openEditor('SUM(clicks) + SUM(orders.amount)');
    typeFormula('SUM(impressions) + SUM(orders.amount)');
    apply();

    expect(onSave).toHaveBeenCalledWith(
      'SUM({{ref field="impressions"}}) + SUM({{ref path="orders" field="amount"}})'
    );
  });

  it('applying an untouched formula saves nothing', () => {
    const onSave = renderCell({ formula: CTR_FORMULA });

    openEditor('SUM(clicks) / NULLIF(SUM(impressions), 0)');
    apply();

    expect(onSave).not.toHaveBeenCalled();
  });

  it('cancelling after edits never saves, and the next open starts from the stored formula again', () => {
    const onSave = renderCell({ formula: 'SUM({{ref field="clicks"}})' });

    openEditor('SUM(clicks)');
    typeFormula('SUM(impressions)');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onSave).not.toHaveBeenCalled();

    openEditor('SUM(clicks)');
    expect(formulaValue()).toBe('SUM(clicks)');
  });

  it('opens a formula referencing a field no longer in the schema, showing the reference instead of crashing', () => {
    expect(() => {
      renderCell({ formula: 'SUM({{ref field="clicks"}}) + {{ref field="gone"}}' });
    }).not.toThrow();

    expect(formulaRow('SUM(clicks) + gone').textContent).toBe('SUM(clicks) + gone');
  });

  it('still saves a formula whose referenced field vanished from the schema', () => {
    // `gone` has no index entry but IS a resolved reference carried forward from the stored form,
    // so the guard must leave it to the backend, which names it precisely.
    const onSave = renderCell({ formula: 'SUM({{ref field="clicks"}}) + {{ref field="gone"}}' });

    openEditor('SUM(clicks) + gone');
    typeFormula('SUM(clicks) + gone + 1');
    apply();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledWith('SUM({{ref field="clicks"}}) + {{ref field="gone"}} + 1');
  });

  it('refuses an empty formula', () => {
    const onSave = renderCell({ formula: 'SUM({{ref field="clicks"}})' });

    openEditor('SUM(clicks)');
    typeFormula('   ');
    apply();

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/needs a formula/i);
  });

  it('shows an error and does not save when a resolved reference cannot be stored (field name carries a double quote)', () => {
    // A warehouse column name carries no character restriction (formula-authoring.ts), so
    // toStoredForm can genuinely throw on Apply — it must be caught, not escape uncaught.
    const onSave = renderCell({ own: [...fields, field({ name: 'we"ird', type: 'INTEGER' })] });

    openEditor('Formula is required');
    typeFormula('we"ird');

    expect(() => {
      apply();
    }).not.toThrow();

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/double quote/i);
  });

  it('refuses a formula naming a field the editor could not resolve, naming that field', () => {
    // `orders.amount` names a JOINED Data Mart this metric's own Data Mart does not join, so it is
    // in neither index, no tag is produced for it, and it would travel to the backend as bare SQL —
    // which answers "SUM references no field. Use SUM(field)." about a formula that says SUM(field).
    const onSave = renderCell({ formula: 'SUM({{ref field="clicks"}})' });

    openEditor('SUM(clicks)');
    typeFormula('SUM(clicks) * 2 * SUM(orders.amount)');
    apply();

    expect(onSave).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('orders.amount');
    expect(alert).toHaveTextContent(/join alias/);
    expect(alert).not.toHaveTextContent(/not yet supported/);
    expect(alert).not.toHaveTextContent(/references no field/i);
  });

  it('clears the unresolved-name error once the formula is edited', () => {
    const onSave = renderCell({ formula: 'SUM({{ref field="clicks"}})' });

    openEditor('SUM(clicks)');
    typeFormula('SUM(clickz)');
    apply();
    expect(screen.getByRole('alert')).toHaveTextContent('clickz');

    typeFormula('SUM(impressions)');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    apply();
    expect(onSave).toHaveBeenCalledWith('SUM({{ref field="impressions"}})');
  });

  it('saves a formula whose only unresolved-looking names are SQL keywords and scalar calls', () => {
    // The guard's false-positive direction is the dangerous one: it would block a valid formula.
    const onSave = renderCell({ formula: 'SUM({{ref field="clicks"}})' });

    openEditor('SUM(clicks)');
    typeFormula(
      'CAST(SUM(CASE WHEN clicks IS NOT NULL THEN clicks ELSE 0 END) AS FLOAT64) ' +
        "/ NULLIF(SUM(impressions), 0) -- ignore orders.amount for now, see 'joined'"
    );
    apply();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  /**
   * The whole point, end to end on the web side: `roas = revenue / cost` where both
   * operands are calculated fields of this same Data Mart. Until the index offered them, the two
   * names resolved to nothing, travelled as bare SQL, and Apply refused the formula outright.
   */
  describe('a formula reading another calculated field', () => {
    const calculatedOwn = [
      ...fields,
      field({
        name: 'revenue',
        type: 'DOUBLE',
        calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
      }),
      field({
        name: 'cost',
        type: 'DOUBLE',
        calculated: { formula: 'SUM({{ref field="impressions"}})', level: 'metric' },
      }),
    ];

    it('saves it as tags, the same spelling any other reference gets', () => {
      const onSave = renderCell({
        formula: 'SUM({{ref field="clicks"}})',
        own: calculatedOwn,
      });

      openEditor('SUM(clicks)');
      typeFormula('revenue / cost');
      apply();

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(onSave).toHaveBeenCalledWith('{{ref field="revenue"}} / {{ref field="cost"}}');
    });

    it('leaves the formula alone while a metric added a moment ago is still unnamed', () => {
      // "Add calculated field" appends its row before the analyst names it, so the schema really
      // does hold a nameless calculated field for as long as it takes to type one. Offering it
      // would put an empty name in the index, which matches everywhere: the save then carried a
      // `{{ref field=""}}` the analyst never wrote.
      const onSave = renderCell({
        formula: 'SUM({{ref field="clicks"}})',
        own: [...fields, field({ name: '', calculated: { formula: '' } })],
      });

      openEditor('SUM(clicks)');
      typeFormula('SUM(clicks) * 2');
      apply();

      expect(onSave).toHaveBeenCalledWith('SUM({{ref field="clicks"}}) * 2');
    });

    it('says on the row chip that the reference already aggregates', () => {
      // Which is what decides how it may be written: wrapped in a SUM, the save refuses it.
      renderCell({ formula: '{{ref field="revenue"}} / 2', own: calculatedOwn });

      const row = formulaRow('revenue / 2');
      const titles = [...row.querySelectorAll('.formula-field-chip')].map(chip =>
        chip.getAttribute('title')
      );

      expect(titles).toEqual([
        'revenue is a calculated field that already aggregates, so it cannot be wrapped in ' +
          'another aggregation.',
      ]);
    });
  });

  // Asked for after seeing chips live: the popover covers the row it is editing, the footer's left
  // half was empty, and a field looked like a field only inside the editor.
  describe('the popover chrome and the row', () => {
    const chipsIn = (element: HTMLElement) =>
      [...element.querySelectorAll('.formula-field-chip')].map(chip => chip.textContent);

    it('names the metric being edited, so the covered row is still identifiable', () => {
      renderCell({ formula: 'SUM({{ref field="clicks"}})', fieldName: 'ctr' });

      openEditor('SUM(clicks)');

      expect(screen.getByRole('heading')).toHaveTextContent('ctr');
    });

    it('falls back to a generic title when the metric has no name yet', () => {
      renderCell({ formula: 'SUM({{ref field="clicks"}})' });

      openEditor('SUM(clicks)');

      expect(screen.getByRole('heading')).toHaveTextContent('Formula');
    });

    it('says what the editor expects and links the docs', () => {
      renderCell({ formula: 'SUM({{ref field="clicks"}})' });

      openEditor('SUM(clicks)');

      const link = screen.getByRole('link', { name: /learn more/i });
      expect(link).toHaveAttribute(
        'href',
        expect.stringContaining('setup-guide/calculated-fields/')
      );
      expect(link).toHaveAttribute('href', expect.stringContaining('utm_source=owox_data_marts'));
      expect(screen.getByText(/warehouse sql/i)).toBeInTheDocument();
    });

    // One place in the chrome answers "why can I not save this?"; the hint is the same place's
    // answer to "what goes in here?", and only one of them can be the current answer.
    it('gives the hint place to a refusal while there is one, and takes it back after', () => {
      renderCell({ formula: 'SUM({{ref field="clicks"}})' });

      openEditor('SUM(clicks)');
      typeFormula('SUM(nonsense)');
      apply();

      expect(screen.getByRole('alert')).toHaveTextContent('nonsense');
      expect(screen.queryByText(/warehouse sql/i)).not.toBeInTheDocument();

      typeFormula('SUM(clicks)');

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText(/warehouse sql/i)).toBeInTheDocument();
    });

    it('draws the row formula with a chip on each resolved reference', () => {
      renderCell({ formula: CTR_FORMULA });

      const row = formulaRow('SUM(clicks) / NULLIF(SUM(impressions), 0)');

      expect(chipsIn(row)).toEqual(['clicks', 'impressions']);
      // …and the text around them is untouched, character for character.
      expect(row.textContent).toBe('SUM(clicks) / NULLIF(SUM(impressions), 0)');
    });

    it('draws chips in a read-only row too', () => {
      renderCell({ formula: 'SUM({{ref field="clicks"}})', readOnly: true });

      expect(chipsIn(formulaRow('SUM(clicks)'))).toEqual(['clicks']);
    });

    it('draws no chip over a name that never resolved', () => {
      renderCell({ formula: 'SUM(nonsense)' });

      expect(chipsIn(formulaRow('SUM(nonsense)'))).toEqual([]);
    });

    // `orders` is a join alias, and an alias is not what anyone knows the Data Mart by — the
    // question the demo asked of `SUM(orders.amount)`.
    it('names the joined Data Mart on the row chip, and leaves an own field alone', () => {
      renderCell({
        formula: 'SUM({{ref field="clicks"}}) + SUM({{ref path="orders" field="amount"}})',
        joined: [joinedField()],
      });

      const row = formulaRow('SUM(clicks) + SUM(orders.amount)');
      const titles = [...row.querySelectorAll('.formula-field-chip')].map(chip =>
        chip.getAttribute('title')
      );

      expect(titles).toEqual([null, 'amount from the joined Data Mart \u201COrders\u201D']);
      // The whole formula stays on the cell, so a hover anywhere else still shows it.
      expect(screen.getByTitle('SUM(clicks) + SUM(orders.amount)')).toBeInTheDocument();
    });
  });

  it('renders read-only text with no editor when there is no save path', () => {
    renderCell({ formula: 'SUM({{ref field="clicks"}})', readOnly: true });

    const formula = formulaRow('SUM(clicks)');
    expect(formula.tagName).not.toBe('BUTTON');
    fireEvent.click(formula);
    expect(screen.queryByTestId('formula-editor')).not.toBeInTheDocument();
  });

  describe('live problems from the backend', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      validateFormula.mockReset();
      validateFormula.mockResolvedValue({ errors: [], warnings: [] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    async function settle(ms = FORMULA_DIAGNOSTICS_DEBOUNCE_MS) {
      await act(async () => {
        vi.advanceTimersByTime(ms);
      });
      await act(async () => {
        await Promise.resolve();
      });
    }

    it('sends the formula in STORED form and shows what comes back beneath the editor', async () => {
      validateFormula.mockResolvedValue({
        errors: [
          {
            code: 'FORMULA_LEVEL_MIXING',
            field: 'ctr',
            message:
              '`clicks` is a row-level column, so it has no defined value once a report groups ' +
              'rows. Wrap it in an aggregation (SUM / COUNT / MIN / MAX).',
          },
        ],
        warnings: [],
      });
      renderCell({ formula: 'SUM({{ref field="clicks"}})', live: true });

      openEditor('SUM(clicks)');
      typeFormula('clicks');
      await settle();

      expect(validateFormula).toHaveBeenCalledWith(
        'dm-1',
        { name: 'ctr', type: 'FLOAT', formula: '{{ref field="clicks"}}' },
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
      expect(screen.getByTestId('formula-diagnostics')).toHaveTextContent('row-level column');
    });

    /**
     * The schema editor defers its save, so `revenue` and `cost` exist only on screen while
     * `roas = revenue / cost` is being written. Asked about the persisted schema alone, the panel
     * answered "`revenue` no longer exists in the Data Mart" and squiggled the reference — in the
     * exact flow this exists for, about a formula the save then accepted.
     */
    it('tells the check which formulas the editor is holding, saved or not', async () => {
      renderCell({
        formula: '{{ref field="revenue"}} / {{ref field="cost"}}',
        own: [
          ...fields,
          field({ name: 'revenue', type: 'FLOAT', calculated: { formula: 'SUM(1)' } }),
          field({ name: 'cost', type: 'FLOAT', calculated: { formula: 'SUM(2)' } }),
          // Unnamed and unfilled, exactly as "Add calculated field" leaves a new row: sent as is,
          // every entry needs a name and a formula, so this one would 400 the whole request.
          field({ name: '', type: 'FLOAT', calculated: { formula: '' } }),
        ],
        live: true,
      });

      openEditor('revenue / cost');
      typeFormula('revenue / cost * 2');
      await settle();

      expect(validateFormula).toHaveBeenCalledWith(
        'dm-1',
        expect.objectContaining({
          calculatedFields: [
            { name: 'revenue', type: 'FLOAT', formula: 'SUM(1)' },
            { name: 'cost', type: 'FLOAT', formula: 'SUM(2)' },
          ],
        }),
        expect.anything()
      );
    });

    // The whole point of keeping this channel off the Apply path: the verdict is asynchronous, so
    // gating on it would let a stale answer refuse a formula the analyst has already fixed.
    it('leaves Apply enabled and working while a backend error is on screen', async () => {
      validateFormula.mockResolvedValue({
        errors: [
          {
            code: 'FORMULA_LEVEL_MIXING',
            field: 'ctr',
            subject: 'clicks',
            message: '`clicks` is row-level.',
          },
        ],
        warnings: [],
      });
      const onSave = renderCell({ formula: 'SUM({{ref field="clicks"}})', live: true });

      openEditor('SUM(clicks)');
      typeFormula('clicks');
      await settle();
      expect(screen.getByTestId('formula-diagnostics')).toHaveTextContent('`clicks` is row-level.');

      const applyButton = screen.getByRole('button', { name: 'Apply' });
      expect(applyButton).not.toBeDisabled();
      fireEvent.click(applyButton);

      expect(onSave).toHaveBeenCalledWith('{{ref field="clicks"}}');
    });

    it('asks once for a burst of typing, about the formula that was left', async () => {
      renderCell({ formula: 'SUM({{ref field="clicks"}})', live: true });

      openEditor('SUM(clicks)');
      for (const text of ['SUM(clicks) ', 'SUM(clicks) /', 'SUM(clicks) / SUM(impressions)']) {
        typeFormula(text);
        await settle(FORMULA_DIAGNOSTICS_DEBOUNCE_MS - 50);
      }
      await settle();

      expect(validateFormula).toHaveBeenCalledTimes(1);
      expect(validateFormula.mock.calls[0][1].formula).toBe(
        'SUM({{ref field="clicks"}}) / SUM({{ref field="impressions"}})'
      );
    });

    it('asks nothing while the popover is closed', async () => {
      renderCell({ formula: 'SUM({{ref field="clicks"}})', live: true });

      await settle(FORMULA_DIAGNOSTICS_DEBOUNCE_MS * 5);

      expect(validateFormula).not.toHaveBeenCalled();
    });

    it('asks nothing more once the analyst closes the editor', async () => {
      renderCell({ formula: 'SUM({{ref field="clicks"}})', live: true });

      openEditor('SUM(clicks)');
      typeFormula('SUM(impressions)');
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await settle(FORMULA_DIAGNOSTICS_DEBOUNCE_MS * 5);

      expect(validateFormula).not.toHaveBeenCalled();
    });

    it('says nothing when the check cannot be reached', async () => {
      validateFormula.mockRejectedValue(new Error('Network Error'));
      renderCell({ formula: 'SUM({{ref field="clicks"}})', live: true });

      openEditor('SUM(clicks)');
      typeFormula('SUM(impressions)');
      await settle();

      // The live region is always mounted (a11y); what matters is that it stays empty.
      expect(screen.getByTestId('formula-diagnostics')).toBeEmptyDOMElement();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('never asks for a table that knows no Data Mart', async () => {
      renderCell({ formula: 'SUM({{ref field="clicks"}})' });

      openEditor('SUM(clicks)');
      typeFormula('SUM(impressions)');
      await settle(FORMULA_DIAGNOSTICS_DEBOUNCE_MS * 5);

      expect(validateFormula).not.toHaveBeenCalled();
    });
  });

  describe('joined Data Mart fields', () => {
    it('saves a joined reference as a tag carrying the joined source path', () => {
      const onSave = renderCell({
        formula: 'SUM({{ref field="clicks"}})',
        joined: [joinedField(), joinedField({ originalFieldName: 'qty', type: 'INTEGER' })],
      });

      openEditor('SUM(clicks)');
      typeFormula('SUM(clicks) * 2 * SUM(orders.amount)');
      apply();

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(onSave).toHaveBeenCalledWith(
        'SUM({{ref field="clicks"}}) * 2 * SUM({{ref path="orders" field="amount"}})'
      );
    });

    it('shows a stored joined reference in authoring form', () => {
      renderCell({
        formula: 'SUM({{ref path="orders" field="amount"}})',
        joined: [joinedField()],
      });

      expect(formulaRow('SUM(orders.amount)').textContent).toBe('SUM(orders.amount)');
    });

    it('lets an own-Data-Mart field win when a joined name collides with it', () => {
      // A BigQuery RECORD named `orders` with a subfield `amount` produces the same typed name as a
      // Data Mart joined under the alias `orders`. The own field takes precedence, so the tag
      // carries no path at all.
      const onSave = renderCell({
        formula: 'SUM({{ref field="clicks"}})',
        own: [
          ...fields,
          field({
            name: 'orders',
            type: 'RECORD',
            fields: [field({ name: 'amount', type: 'FLOAT' })],
          }),
        ],
        joined: [joinedField()],
      });

      openEditor('SUM(clicks)');
      typeFormula('SUM(orders.amount)');
      apply();

      expect(onSave).toHaveBeenCalledWith('SUM({{ref field="orders.amount"}})');
    });

    it('still saves a metric whose join alias was renamed away', () => {
      // The unresolved-name guard must not start refusing the references this feature added: the
      // stored tag is carried forward as a reference, and the backend names the broken path
      // precisely (FORMULA_JOINED_PATH_NOT_FOUND) instead of this cell guessing.
      const onSave = renderCell({
        formula: 'SUM({{ref path="purchases" field="amount"}})',
        joined: [joinedField()],
      });

      openEditor('SUM(purchases.amount)');
      typeFormula('SUM(purchases.amount) + 1');
      apply();

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(onSave).toHaveBeenCalledWith('SUM({{ref path="purchases" field="amount"}}) + 1');
    });

    it('does not blame the analyst for a joined name when the join tree failed to load', () => {
      // The blendable-schema request 500s, so the joined half of the index is empty for a reason
      // that has nothing to do with the formula. Refusing is still right — the name would otherwise
      // reach the backend as bare SQL and come back as "SUM references no field" — but the reason
      // shown must be ours, and must not assert the field does not exist.
      const onSave = renderCell({
        formula: 'SUM({{ref field="clicks"}})',
        joined: [],
        joinedFieldsStatus: 'unavailable',
      });

      openEditor('SUM(clicks)');
      typeFormula('SUM(clicks) * 2 * SUM(orders.amount)');
      apply();

      expect(onSave).not.toHaveBeenCalled();
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('orders.amount');
      expect(alert).toHaveTextContent(/could not be checked against the joined Data Marts/);
      expect(alert).toHaveTextContent(/reload the page/);
      expect(alert).not.toHaveTextContent(/is not a field of this Data Mart/);
      expect(alert).not.toHaveTextContent(/check that the alias/);
    });

    it('refuses a joined field hidden in the joined Data Marts setup, which the backend rejects', () => {
      const onSave = renderCell({
        formula: 'SUM({{ref field="clicks"}})',
        joined: [joinedField({ originalFieldName: 'secret', isHidden: true })],
      });

      openEditor('SUM(clicks)');
      typeFormula('SUM(orders.secret)');
      apply();

      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent('orders.secret');
    });
  });
});

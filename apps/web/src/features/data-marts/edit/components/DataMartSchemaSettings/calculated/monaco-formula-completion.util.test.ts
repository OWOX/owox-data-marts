import type * as monacoEditor from 'monaco-editor';
import { describe, expect, it, vi } from 'vitest';
import { DataStorageType } from '../../../../../data-storage';
import { aggregateFunctionsFor } from './formula-function-dialects';
import type { ReferenceableField } from './formula-reference-index';
import { scalarFunctionsFor } from './formula-scalar-functions';
import { registerFormulaCompletionProvider } from './monaco-formula-completion.util';

/** Monaco's `CompletionItemLabel`: name, muted detail beside it, right-aligned description. */
interface CompletionItemLabelLike {
  label: string;
  detail?: string;
  description?: string;
}

interface CompletionRangeLike {
  startLineNumber: number;
  endLineNumber: number;
  startColumn: number;
  endColumn: number;
}

interface CompletionItemLike {
  label: string | CompletionItemLabelLike;
  detail?: string;
  insertText?: string;
  insertTextRules?: number;
  kind?: number;
  sortText?: string;
  range?: CompletionRangeLike;
}

/** The name a row completes to, whichever of the two label shapes it uses. */
const nameOf = (item: CompletionItemLike): string =>
  typeof item.label === 'string' ? item.label : item.label.label;

/**
 * The completion provider is exercised end to end through the component in `FormulaEditor.test.tsx`
 * and, storage type and all, through the table in `BaseSchemaTable.test.tsx`. This spec drives
 * `registerFormulaCompletionProvider` directly instead, so the shape of a suggestion row can be
 * pinned without a React tree and a Monaco stub in the way.
 *
 * A fresh fake monaco per call: the module de-duplicates providers per (monaco instance, language),
 * so sharing one instance across tests would make each registration dispose the previous one's.
 */
function completionsFor(options: {
  fields?: readonly ReferenceableField[];
  functions?: readonly string[];
  scalarFunctions?: readonly string[];
  /** What is already on the line, cursor at its end. Empty line by default. */
  typed?: string;
  /** The model the completion is asked about, when it is NOT this editor's. */
  askedModel?: monacoEditor.editor.ITextModel;
}): CompletionItemLike[] | null | undefined {
  let registered: {
    provideCompletionItems: (model: unknown, position: unknown) => unknown;
  } | null = null;

  const monacoInstance = {
    languages: {
      // The real monaco enum values, so a kind assertion below means something.
      CompletionItemKind: { Field: 4, Function: 1, Snippet: 27 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      registerCompletionItemProvider: (_languageId: string, provider: unknown) => {
        registered = provider as typeof registered;
        return { dispose: vi.fn() };
      },
    },
  } as unknown as typeof monacoEditor;

  const typed = options.typed ?? '';
  const ownModel = {
    getValueInRange: () => typed,
  } as unknown as monacoEditor.editor.ITextModel;

  registerFormulaCompletionProvider(
    monacoInstance,
    'sql',
    () => ownModel,
    () => options.fields ?? [],
    () => options.functions ?? [],
    () => options.scalarFunctions ?? []
  );

  const provider = registered as unknown as {
    provideCompletionItems: (
      model: monacoEditor.editor.ITextModel,
      position: { lineNumber: number; column: number }
    ) => { suggestions: CompletionItemLike[] } | null | undefined;
  };
  return provider.provideCompletionItems(options.askedModel ?? ownModel, {
    lineNumber: 1,
    column: typed.length + 1,
  })?.suggestions;
}

/** The suggestions for this editor's OWN model — every case but the cross-model guard. */
function ownCompletionsFor(options: Parameters<typeof completionsFor>[0]): CompletionItemLike[] {
  const suggestions = completionsFor(options);
  if (!suggestions) throw new Error('expected suggestions for this editor’s own model');
  return suggestions;
}

function referenceable(overrides: Partial<ReferenceableField> = {}): ReferenceableField {
  return {
    name: 'clicks',
    path: '',
    field: 'clicks',
    type: 'INTEGER',
    isHidden: false,
    ...overrides,
  };
}

/**
 * A field row carries three facts — the name, its type, and which Data Mart it came from — and
 * Monaco has a slot for each (`CompletionItemLabel`). Packing them into one `detail` string put
 * them all in the same right-aligned element, where the type read as part of the source name.
 */
describe('registerFormulaCompletionProvider: field rows', () => {
  it('gives a joined field its own name, type and Data Mart slots', () => {
    const [item] = ownCompletionsFor({
      fields: [
        referenceable({
          name: 'orders.amount',
          path: 'orders',
          field: 'amount',
          type: 'FLOAT',
          sourceLabel: 'Orders',
        }),
      ],
    });

    expect(item.label).toEqual({
      label: 'orders.amount',
      detail: '\u00A0FLOAT',
      description: 'Orders',
    });
    // The name is still what gets typed: Monaco filters on `label.label`, so a row whose label
    // object lost its `label` would stop matching what the analyst types.
    expect(item.insertText).toBe('orders.amount');
  });

  it('omits description on an own-Data-Mart field rather than rendering undefined', () => {
    const [item] = ownCompletionsFor({ fields: [referenceable()] });

    expect(item.label).toStrictEqual({ label: 'clicks', detail: '\u00A0INTEGER' });
    expect(typeof item.label === 'string' ? [] : Object.keys(item.label)).not.toContain(
      'description'
    );
  });

  it('marks a hidden field without spending the type slot on the marker', () => {
    const [item] = ownCompletionsFor({
      fields: [referenceable({ name: 'impressions', field: 'impressions', isHidden: true })],
    });

    expect(item.label).toEqual({
      label: 'impressions',
      detail: '\u00A0INTEGER',
      description: 'hidden',
    });
  });

  /**
   * A calculated candidate's LEVEL decides how it may be written: an aggregate-level one is legal
   * bare and refused inside an aggregation, a row-level one is refused bare in a formula that
   * aggregates. A row that shows the name and withholds that invites the formula the save refuses.
   */
  it('says an aggregate-level calculated field already aggregates', () => {
    const [item] = ownCompletionsFor({
      fields: [
        referenceable({
          name: 'revenue',
          field: 'revenue',
          type: 'FLOAT',
          calculated: { level: 'metric' },
        }),
      ],
    });

    expect(item.label).toEqual({
      label: 'revenue',
      detail: '\u00A0FLOAT',
      description: 'aggregated formula',
    });
  });

  it('says a row-level calculated field is row-level, not aggregated', () => {
    const [item] = ownCompletionsFor({
      fields: [
        referenceable({
          name: 'ctr',
          field: 'ctr',
          type: 'FLOAT',
          calculated: { level: 'column' },
        }),
      ],
    });

    expect(item.label).toEqual({
      label: 'ctr',
      detail: '\u00A0FLOAT',
      description: 'row-level formula',
    });
  });

  /**
   * A formula applied in this session carries no level until the save derives one. A LABEL may
   * take the same quiet guess the rest of the web takes (`isRowLevelCalculatedField`): the worst it
   * does is under-sell one row of a menu, and it still says the row is a formula. The chip hover
   * deliberately does NOT borrow that guess \u2014 see formula-reference-source.test.ts.
   */
  it('falls back to the quiet reading for a calculated field carrying no level yet', () => {
    const [item] = ownCompletionsFor({
      fields: [referenceable({ name: 'roas', field: 'roas', type: 'FLOAT', calculated: {} })],
    });

    expect(item.label).toMatchObject({ description: 'aggregated formula' });
  });

  it('keeps the hidden marker alongside the level \u2014 a calculated field can be both', () => {
    const [item] = ownCompletionsFor({
      fields: [
        referenceable({
          name: 'ctr',
          field: 'ctr',
          calculated: { level: 'column' },
          isHidden: true,
        }),
      ],
    });

    expect(item.label).toMatchObject({ description: 'row-level formula \u00B7 hidden' });
  });
});

/**
 * A fake monaco whose registrations are told apart: each one's `dispose` records its own index,
 * once, so which provider a later registration tore down is observable.
 */
function trackingMonaco() {
  const disposed: number[] = [];
  let registrations = 0;
  const instance = {
    languages: {
      CompletionItemKind: { Field: 4, Function: 1, Snippet: 27 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      registerCompletionItemProvider: () => {
        const id = registrations++;
        return {
          dispose: () => {
            if (!disposed.includes(id)) disposed.push(id);
          },
        };
      },
      registerHoverProvider: () => {
        const id = registrations++;
        return {
          dispose: () => {
            if (!disposed.includes(id)) disposed.push(id);
          },
        };
      },
    },
  } as unknown as typeof monacoEditor;
  return { disposed, instance };
}

/**
 * Two formula editors can be mounted on one page — two calculated rows, or one being replaced by
 * the next — and the module keeps ONE entry per (monaco, language) so a new registration tears the
 * previous one down. That entry belongs to whoever wrote it last.
 */
describe('registerFormulaCompletionProvider: registration lifecycle', () => {
  it('leaves a later editor’s registration in place when an earlier one unmounts', () => {
    const monaco = trackingMonaco();
    const register = () =>
      registerFormulaCompletionProvider(
        monaco.instance,
        'sql',
        () => null,
        () => []
      );

    const disposeA = register();
    register();
    // Guard the guard: B's registration is what disposed A's provider.
    expect(monaco.disposed).toEqual([0]);

    // A unmounts after B mounted — its own provider is already gone, and B owns the entry now.
    disposeA();
    // C must still find B's provider to dispose; an entry A deleted would leave B registered for
    // good, duplicating every suggestion and pinning its closure.
    register();

    expect(monaco.disposed).toEqual([0, 1]);
  });
});

describe('registerFormulaCompletionProvider: other models', () => {
  it('answers nothing for a model that is not this editor’s', () => {
    // Monaco registers a completion provider per LANGUAGE, and the Data Mart's SQL definition
    // editor mounts as `sql` on this same page — so without this guard its author is offered
    // this Data Mart's schema fields while writing the query that produces them.
    const other = { getValueInRange: () => '' } as unknown as monacoEditor.editor.ITextModel;

    expect(
      completionsFor({ fields: [referenceable()], functions: ['SUM'], askedModel: other })
    ).toBeUndefined();
  });

  it('still answers for its own model, with the guard in place', () => {
    expect(ownCompletionsFor({ fields: [referenceable()] }).map(nameOf)).toContain('clicks');
  });
});

/** The text accepting this entry would overwrite — what its `range` covers, as a string. */
function replacedText(typed: string, item: CompletionItemLike | undefined): string {
  return typed.slice((item?.range?.startColumn ?? 1) - 1);
}

/**
 * A label holding a space is not a "word": the provider's own `/[\w.]*$/` stops at the space, so
 * the default range covers only what follows it. Accepting `IS NOT NULL` at `x IS N` would then
 * overwrite `N` alone and leave `x IS IS NOT NULL`.
 */
describe('registerFormulaCompletionProvider: multi-word entries', () => {
  it('overwrites the part of the phrase already typed, not just the last word', () => {
    const typed = 'SUM(clicks) AND x IS N';
    const suggestions = ownCompletionsFor({ typed, scalarFunctions: ['IS NOT NULL'] });

    expect(
      replacedText(
        typed,
        suggestions.find(s => nameOf(s) === 'IS NOT NULL')
      )
    ).toBe('IS N');
  });

  it('reaches back over a trailing space', () => {
    const typed = 'x IS ';
    const suggestions = ownCompletionsFor({ typed, scalarFunctions: ['IS NULL'] });

    expect(
      replacedText(
        typed,
        suggestions.find(s => nameOf(s) === 'IS NULL')
      )
    ).toBe('IS ');
  });

  it('leaves a single-word entry on the plain word range', () => {
    const typed = 'x IS N';
    const suggestions = ownCompletionsFor({ typed, scalarFunctions: ['IS NOT NULL', 'NULLIF'] });

    expect(
      replacedText(
        typed,
        suggestions.find(s => nameOf(s) === 'NULLIF')
      )
    ).toBe('N');
  });

  it('never narrows the range to the tail of a word', () => {
    // `abcIS` ends with a phrase prefix, but replacing only the `IS` would leave `abcIS NULL`.
    const typed = 'abcIS';
    const suggestions = ownCompletionsFor({ typed, scalarFunctions: ['IS NULL'] });

    expect(
      replacedText(
        typed,
        suggestions.find(s => nameOf(s) === 'IS NULL')
      )
    ).toBe('abcIS');
  });

  it('applies to the guarded-division snippet, whose label is two words as well', () => {
    const typed = 'guarded d';
    const suggestions = ownCompletionsFor({ typed });

    expect(
      replacedText(
        typed,
        suggestions.find(s => nameOf(s) === 'guarded division')
      )
    ).toBe('guarded d');
  });

  // The widened range must also start on a token boundary. `analysis`, `axis`, `basis` and `this`
  // all END in a phrase prefix, and a range beginning inside one eats the analyst's identifier:
  // `CASE WHEN analysis ` would otherwise complete to `CASE WHEN analysIS NULL`.
  describe('never starts inside the identifier before it', () => {
    it.each([
      { typed: 'CASE WHEN analysis ', label: 'IS NULL', overwrites: '' },
      { typed: 'x + this ', label: 'IS NOT NULL', overwrites: '' },
      { typed: 'abcguarded d', label: 'guarded division', overwrites: 'd' },
    ])('"$typed" + $label overwrites "$overwrites"', ({ typed, label, overwrites }) => {
      const suggestions = ownCompletionsFor({ typed, scalarFunctions: [label] });

      expect(
        replacedText(
          typed,
          suggestions.find(s => nameOf(s) === label)
        )
      ).toBe(overwrites);
    });
  });

  // The widening covers PREFIX-aligned typing only, and that is a real limit rather than a claim
  // of completeness — pinned here so it is visible instead of discovered.
  it.each(['x NOT N', 'x IS  N'])('leaves "%s" on the plain word range', typed => {
    const suggestions = ownCompletionsFor({ typed, scalarFunctions: ['IS NOT NULL'] });

    expect(
      replacedText(
        typed,
        suggestions.find(s => nameOf(s) === 'IS NOT NULL')
      )
    ).toBe('N');
  });
});

describe('registerFormulaCompletionProvider: scalar functions', () => {
  it('offers a scalar function as a call snippet, after the aggregates', () => {
    const suggestions = ownCompletionsFor({
      functions: ['SUM'],
      scalarFunctions: ['COALESCE', 'IS NULL'],
    });
    const item = suggestions.find(s => nameOf(s) === 'COALESCE');

    expect(item).toMatchObject({
      label: 'COALESCE',
      insertText: 'COALESCE($0)',
      detail: 'function',
      kind: 1,
      insertTextRules: 4,
    });
    // The whole point of the shared sortText namespace: the long scalar list sits below the
    // aggregates rather than interleaving with them alphabetically.
    expect(
      String(suggestions.find(s => nameOf(s) === 'SUM')?.sortText) < String(item?.sortText)
    ).toBe(true);
  });

  // Not cosmetic, unlike `AND()`: Trino (Athena) and Redshift reject the parenthesised form of
  // these outright, so this is the editor's own suggestion being legal SQL where it is offered.
  it('inserts a niladic date function bare, and an ordinary one as a call', () => {
    const suggestions = ownCompletionsFor({
      scalarFunctions: ['CURRENT_DATE', 'CURRENT_TIMESTAMP', 'SYSDATE', 'NOW', 'GETDATE'],
    });
    const insertFor = (label: string) =>
      suggestions.find(candidate => nameOf(candidate) === label)?.insertText;

    expect(insertFor('CURRENT_DATE')).toBe('CURRENT_DATE');
    expect(insertFor('CURRENT_TIMESTAMP')).toBe('CURRENT_TIMESTAMP');
    expect(insertFor('SYSDATE')).toBe('SYSDATE');
    expect(insertFor('NOW')).toBe('NOW($0)');
    expect(insertFor('GETDATE')).toBe('GETDATE($0)');
  });

  it('inserts a word operator without parentheses', () => {
    const suggestions = ownCompletionsFor({ scalarFunctions: ['IS NOT NULL', 'AND', 'CASE'] });

    for (const label of ['IS NOT NULL', 'AND', 'CASE']) {
      const item = suggestions.find(s => nameOf(s) === label);
      // `AND()` would be typed then immediately deleted, every single time.
      expect(item?.insertText).toBe(label);
      expect(item?.insertTextRules).toBeUndefined();
    }
  });

  it('offers no scalar functions when none are supplied', () => {
    expect(ownCompletionsFor({ functions: ['SUM'] }).filter(s => s.detail === 'function')).toEqual(
      []
    );
  });

  // A name in two groups is a defect: the analyst sees the same function twice and cannot tell
  // what distinguishes the rows. This is the end-to-end guard on `scalarFunctionsFor` never
  // repeating an aggregate — asserted where the two lists actually meet.
  it('shows every aggregate exactly once across all groups, for every storage', () => {
    // Guard the guard: with an empty scalar list this assertion holds for the wrong reason.
    expect(scalarFunctionsFor(DataStorageType.GOOGLE_BIGQUERY).length).toBeGreaterThan(0);

    for (const storage of Object.values(DataStorageType)) {
      const functions = aggregateFunctionsFor(storage);
      const suggestions = ownCompletionsFor({
        functions,
        scalarFunctions: scalarFunctionsFor(storage),
      });
      const labels = suggestions.map(nameOf);

      for (const aggregate of functions) {
        expect(labels.filter(label => label === aggregate)).toEqual([aggregate]);
      }
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});

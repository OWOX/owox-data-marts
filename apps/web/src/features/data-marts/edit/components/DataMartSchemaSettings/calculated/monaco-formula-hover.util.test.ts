import type * as monacoEditor from 'monaco-editor';
import { describe, expect, it, vi } from 'vitest';
import type { ResolvedReference } from './formula-authoring';
import { registerFormulaHoverProvider } from './monaco-formula-hover.util';

interface HoverLike {
  range: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  contents: { value: string }[];
}

const AMOUNT: ResolvedReference = {
  text: 'orders.amount',
  start: 4,
  end: 17,
  path: 'orders',
  field: 'amount',
};

/** A stand-in for the model this editor owns: enough of `ITextModel` for the provider to read. */
function fakeModel(text: string) {
  return {
    getValue: () => text,
    // Single-line by construction here; the provider only ever asks for the caret's own offset.
    getOffsetAt: ({ column }: { column: number }) => column - 1,
  } as unknown as monacoEditor.editor.ITextModel;
}

/**
 * Drives the provider directly rather than through a React tree, for the same reason
 * `monaco-formula-completion.util.test.ts` does. The browser-only half — that Monaco's hover widget
 * escapes the popover's transformed subtree at all — is not observable here and is covered in
 * `apps/web/e2e/specs/datamart-calculated-field-chips.spec.ts`.
 *
 * A fresh fake monaco per call: registration de-duplicates per (monaco instance, language), so a
 * shared instance would have each test dispose the previous one's provider.
 */
function hoverFor(options: {
  text: string;
  /** 1-based, as Monaco counts columns. */
  column: number;
  references?: readonly ResolvedReference[];
  describe?: (ref: ResolvedReference) => string | undefined;
  /** The model the hover is asked about, when it is NOT this editor's. */
  askedModel?: monacoEditor.editor.ITextModel;
}): HoverLike | null {
  let registered: {
    provideHover: (model: unknown, position: unknown) => unknown;
  } | null = null;

  const monacoInstance = {
    languages: {
      registerHoverProvider: (_languageId: string, provider: unknown) => {
        registered = provider as typeof registered;
        return { dispose: vi.fn() };
      },
    },
  } as unknown as typeof monacoEditor;

  const ownModel = fakeModel(options.text);
  registerFormulaHoverProvider(
    monacoInstance,
    'sql',
    () => ownModel,
    () => options.references ?? [AMOUNT],
    options.describe ?? (ref => `${ref.field} from the joined Data Mart \u201COrders\u201D`)
  );

  const provider = registered as unknown as {
    provideHover: (
      model: monacoEditor.editor.ITextModel,
      position: { lineNumber: number; column: number }
    ) => HoverLike | null;
  };
  return provider.provideHover(options.askedModel ?? ownModel, {
    lineNumber: 1,
    column: options.column,
  });
}

/**
 * The same registration-lifecycle rule `monaco-formula-completion.util.test.ts` pins, on the twin
 * that keeps its own per-(monaco, language) map: the entry belongs to whoever wrote it last, so an
 * earlier editor unmounting must not take a later one's registration off the books.
 */
describe('registerFormulaHoverProvider: registration lifecycle', () => {
  it('leaves a later editor’s registration in place when an earlier one unmounts', () => {
    const disposed: number[] = [];
    let registrations = 0;
    const monacoInstance = {
      languages: {
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

    const register = () =>
      registerFormulaHoverProvider(
        monacoInstance,
        'sql',
        () => null,
        () => [],
        () => undefined
      );

    const disposeA = register();
    register();
    expect(disposed).toEqual([0]);

    disposeA();
    register();

    expect(disposed).toEqual([0, 1]);
  });
});

describe('registerFormulaHoverProvider', () => {
  it('names the Data Mart behind a joined reference, over the reference itself', () => {
    const hover = hoverFor({ text: 'SUM(orders.amount)', column: 8 });

    expect(hover?.contents[0].value).toBe('amount from the joined Data Mart \u201COrders\u201D');
    // Monaco columns are 1-based: the reference occupies offsets [4, 17).
    expect(hover?.range).toEqual({
      startLineNumber: 1,
      startColumn: 5,
      endLineNumber: 1,
      endColumn: 18,
    });
  });

  it('answers nothing outside a reference', () => {
    expect(hoverFor({ text: 'SUM(orders.amount)', column: 2 })).toBeNull();
    // The span is half-open: the character after it is `)`, not part of the reference.
    expect(hoverFor({ text: 'SUM(orders.amount)', column: 18 })).toBeNull();
  });

  it('answers nothing when the description has nothing to add', () => {
    expect(
      hoverFor({ text: 'SUM(orders.amount)', column: 8, describe: () => undefined })
    ).toBeNull();
  });

  it('answers nothing for a model that is not this editor’s', () => {
    // The Data Mart's SQL definition editor is `sql` too and can be on the same page. These offsets
    // describe THIS formula; applied there they would name whatever characters sit at them.
    const other = fakeModel('SELECT * FROM t');
    expect(hoverFor({ text: 'SUM(orders.amount)', column: 8, askedModel: other })).toBeNull();
  });

  it('answers nothing once the span no longer spells its reference', () => {
    // One keystroke ahead of the re-render that will drop the chip — the same guard the decorations
    // apply before drawing one.
    expect(hoverFor({ text: 'SUM(ordersXamount)', column: 8 })).toBeNull();
  });

  it('escapes markdown, so a Data Mart named with an underscore is not half italic', () => {
    const hover = hoverFor({
      text: 'SUM(orders.amount)',
      column: 8,
      describe: () => 'amount from the joined Data Mart \u201Cmy_data_mart\u201D',
    });

    // The typographic quotes are not markdown syntax and survive untouched; the underscores do not.
    expect(hover?.contents[0].value).toBe(
      'amount from the joined Data Mart \u201Cmy\\_data\\_mart\u201D'
    );
  });
});

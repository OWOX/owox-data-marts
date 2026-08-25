import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { FormulaEditor } from './FormulaEditor';
import { WORD_TRIGGER_CHARACTERS } from './monaco-formula-completion.util';
import type { ReferenceableField } from './formula-reference-index';
import type { ResolvedReference } from './formula-authoring';
import type { FormulaDiagnostics } from './useFormulaDiagnostics';

interface CompletionItem {
  /** A field row uses Monaco's object form (name / muted detail / right-aligned description). */
  label: string | { label: string; detail?: string; description?: string };
  detail?: string;
  insertText?: string;
  [key: string]: unknown;
}

const nameOf = (item: CompletionItem): string =>
  typeof item.label === 'string' ? item.label : item.label.label;

interface CompletionModel {
  getValueInRange: () => string;
  getLineContent: () => string;
}

interface CompletionPosition {
  lineNumber: number;
  column: number;
}

interface CompletionProviderLike {
  triggerCharacters?: string[];
  provideCompletionItems: (
    model: CompletionModel,
    position: CompletionPosition
  ) => { suggestions: CompletionItem[] };
}

interface DisposableLike {
  dispose: () => void;
}

interface MarkerLike {
  message: string;
  severity: number;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

interface RangeLike {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

interface DecorationLike {
  range: RangeLike;
  options: { inlineClassName?: string };
}

// vi.mock factories run before this file's own top-level `let`/`const` statements (module
// evaluation order), so any mutable state the mock needs to share with the tests below has to
// live inside vi.hoisted — a plain outer variable would still be in its temporal dead zone.
const mockState = vi.hoisted(() => ({
  registeredProvider: null as unknown,
  registeredHoverProvider: null as unknown,
  providerDisposable: null as unknown,
  providerDisposables: [] as unknown[],
  latestOnChange: null as unknown,
  latestOptions: null as unknown,
  disposeCallbacks: [] as (() => void)[],
  markerCalls: [] as { owner: string; markers: MarkerLike[] }[],
  /** Every `set` on the chip decorations collection, newest last. */
  chipDecorationSets: [] as DecorationLike[][],
  chipRanges: [] as RangeLike[],
  /** How many times the editor took focus on mount — see the keyboard-entry test below. */
  focusCalls: 0,
  keyListeners: [] as ((event: unknown) => void)[],
  /** Keybinding → handler, as registered through `editor.addCommand`. */
  commands: new Map<number, () => void>(),
  /** What the mock model currently holds — the hover provider reads the text off it. */
  modelText: '',
  /** The mock model itself: the hover provider answers only about the editor's own. */
  model: null as unknown,
  /** Where the caret sits in the mock editor, 1-based as Monaco counts columns. */
  caretColumn: 1,
  edits: [] as { range: RangeLike; text: string | null }[],
}));

// Monaco pulls in web workers happy-dom cannot run. The insights template editor's tests stub
// Editor down to a passive value display; this one additionally has to exercise the onMount
// wiring (completion provider registration + disposal) and the onChange resolution path, so the
// stub is a bit richer: it captures both callbacks for the helpers below to drive directly.
vi.mock('@monaco-editor/react', () => {
  const monacoMock = {
    languages: {
      // The real monaco enum values, so a kind assertion below means something.
      CompletionItemKind: { Field: 4, Function: 1, Snippet: 27 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      registerCompletionItemProvider: (_languageId: string, provider: unknown) => {
        mockState.registeredProvider = provider;
        // A real spy, not a no-op — a disposal test that only checks "did something null this
        // out" can pass even when the component never wires up disposal at all.
        const disposable: DisposableLike = { dispose: vi.fn() };
        mockState.providerDisposable = disposable;
        mockState.providerDisposables.push(disposable);
        return disposable;
      },
      registerHoverProvider: (_languageId: string, provider: unknown) => {
        mockState.registeredHoverProvider = provider;
        const disposable: DisposableLike = { dispose: vi.fn() };
        mockState.providerDisposables.push(disposable);
        return disposable;
      },
    },
    // Real monaco enum values, so a severity assertion below means something.
    MarkerSeverity: { Error: 8, Warning: 4, Info: 2, Hint: 1 },
    KeyMod: { CtrlCmd: 2048 },
    KeyCode: { Enter: 3 },
    editor: {
      setModelMarkers: (_model: unknown, owner: string, markers: MarkerLike[]) => {
        mockState.markerCalls.push({ owner, markers });
      },
    },
  };
  const ignored = { dispose: () => {} };
  // Single line is all this stub covers, which is all any test below writes: offset n sits at
  // column n + 1. The multi-line arithmetic is exercised where it lives, in the two chip specs.
  const modelMock = {
    getOffsetAt: (position: { column: number }) => position.column - 1,
    getPositionAt: (offset: number) => ({ lineNumber: 1, column: offset + 1 }),
    getValue: () => mockState.modelText,
    getValueInRange: () => '',
    getLineContent: () => '',
  };
  mockState.model = modelMock;
  const editorMock = {
    // The real editor focuses itself on mount, because the popover's own autofocus ran long before
    // Monaco finished loading and would otherwise leave the caret on Cancel.
    focus: () => {
      mockState.focusCalls += 1;
    },
    onDidDispose: (cb: () => void) => {
      mockState.disposeCallbacks.push(cb);
      return { dispose: () => {} };
    },
    // Keyboard commit. Kept by keybinding so a test can fire the one the editor actually bound,
    // rather than trusting that it bound anything.
    addCommand: (keybinding: number, handler: () => void) => {
      mockState.commands.set(keybinding, handler);
      return null;
    },
    getModel: () => modelMock,
    // Monaco moves a collection's ranges through every edit; the stub only has to hand back what
    // it was last given, which is what the chip interception reads instead of the props.
    createDecorationsCollection: () => ({
      set: (decorations: DecorationLike[]) => {
        mockState.chipDecorationSets.push(decorations);
        mockState.chipRanges = decorations.map(decoration => decoration.range);
        return [];
      },
      getRanges: () => mockState.chipRanges,
    }),
    getSelection: () => ({
      selectionStartLineNumber: 1,
      selectionStartColumn: mockState.caretColumn,
      positionLineNumber: 1,
      positionColumn: mockState.caretColumn,
    }),
    setSelection: (selection: { positionColumn: number }) => {
      mockState.caretColumn = selection.positionColumn;
    },
    executeEdits: (_source: string, edits: { range: RangeLike; text: string | null }[]) => {
      mockState.edits.push(...edits);
      return true;
    },
    pushUndoStop: () => true,
    onKeyDown: (listener: (event: unknown) => void) => {
      mockState.keyListeners.push(listener);
      return ignored;
    },
    onDidChangeCursorSelection: () => ignored,
    onMouseDown: () => ignored,
    onMouseUp: () => ignored,
  };

  return {
    Editor: (props: {
      value?: string;
      onChange?: (value: string | undefined) => void;
      onMount?: (editor: unknown, monaco: unknown) => void;
      options?: unknown;
    }) => {
      mockState.latestOnChange = props.onChange ?? null;
      mockState.latestOptions = props.options ?? null;
      mockState.modelText = props.value ?? '';
      useEffect(() => {
        props.onMount?.(editorMock, monacoMock);
        return () => {
          // Simulates the real editor tearing down: everything registered via onDidDispose runs.
          mockState.disposeCallbacks.forEach(cb => {
            cb();
          });
          mockState.disposeCallbacks = [];
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    },
  };
});

vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));

async function typeInMockEditor(text: string) {
  const onChange = mockState.latestOnChange as ((value: string | undefined) => void) | null;
  onChange?.(text);
  await Promise.resolve();
}

/** The chips currently drawn, as `[startColumn, endColumn]` pairs. */
function chipColumns(): number[][] {
  const latest = mockState.chipDecorationSets[mockState.chipDecorationSets.length - 1] ?? [];
  return latest.map(decoration => [decoration.range.startColumn, decoration.range.endColumn]);
}

function pressInMockEditor(key: string) {
  const event = {
    browserEvent: { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
  mockState.keyListeners.forEach(listener => {
    listener(event);
  });
  return event;
}

async function completionLabels(): Promise<CompletionItem[]> {
  await Promise.resolve();
  const provider = mockState.registeredProvider as CompletionProviderLike | null;
  if (!provider) return [];
  // The editor's OWN model: the provider answers for no other one.
  const model = mockState.model as CompletionModel;
  const position: CompletionPosition = { lineNumber: 1, column: 1 };
  return provider.provideCompletionItems(model, position).suggestions;
}

function ref(text: string, start: number, end: number): ResolvedReference {
  return { text, start, end, path: '', field: text };
}

function field(overrides: Partial<ReferenceableField> = {}): ReferenceableField {
  return { name: 'f', path: '', field: 'f', type: 'STRING', isHidden: false, ...overrides };
}

const index: ReferenceableField[] = [
  field({ name: 'clicks', field: 'clicks', type: 'INTEGER' }),
  field({ name: 'impressions', field: 'impressions', type: 'INTEGER', isHidden: true }),
];

describe('FormulaEditor', () => {
  beforeEach(() => {
    mockState.registeredProvider = null;
    mockState.registeredHoverProvider = null;
    mockState.providerDisposable = null;
    mockState.providerDisposables = [];
    mockState.latestOnChange = null;
    mockState.latestOptions = null;
    mockState.disposeCallbacks = [];
    mockState.markerCalls = [];
    mockState.chipDecorationSets = [];
    mockState.chipRanges = [];
    mockState.keyListeners = [];
    mockState.commands = new Map();
    mockState.caretColumn = 1;
    mockState.edits = [];
  });

  // The editor loads asynchronously, so the popover's own autofocus has already run and landed on
  // the first candidate — Cancel — by the time Monaco exists. `EditableText`'s focus effect cannot
  // rescue it either: it targets the built-in textarea this editor replaces. Without the editor
  // taking focus itself, a keyboard user types into a button and Enter discards the field.
  it('takes focus when it mounts', () => {
    render(<FormulaEditor value='' references={[]} index={index} onChange={vi.fn()} />);
    expect(mockState.focusCalls).toBeGreaterThan(0);
  });

  // The only keyboard commit this editor has. `EditableText` binds Enter and Ctrl+Enter to the
  // textarea that `renderEditor` replaces, so on this path they reach nothing; Monaco takes Tab for
  // indentation, which leaves the Apply button unreachable without a pointer; and the one key that
  // does escape the editor is Escape, which CANCELS. Keyed on the binding the editor really
  // registered, so renaming the prop cannot make this pass by accident.
  const CTRL_CMD_ENTER = 2048 | 3;

  it('commits through Ctrl/Cmd+Enter', () => {
    const onSubmit = vi.fn();
    render(
      <FormulaEditor
        value='SUM(clicks)'
        references={[]}
        index={index}
        onChange={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    mockState.commands.get(CTRL_CMD_ENTER)?.();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  // Registered whether or not there is anything to commit to, so the binding cannot be a newline on
  // one render and a commit on the next.
  it('registers the binding even with nothing to commit to, and does not throw on it', () => {
    render(<FormulaEditor value='' references={[]} index={index} onChange={vi.fn()} />);

    const command = mockState.commands.get(CTRL_CMD_ENTER);
    expect(command).toBeDefined();
    expect(() => command?.()).not.toThrow();
  });

  // The command is registered once, on mount, so a handler captured then would commit through the
  // first render's callback for the editor's whole life.
  it('commits through the latest callback, not the one it mounted with', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <FormulaEditor value='a' references={[]} index={index} onChange={vi.fn()} onSubmit={first} />
    );
    rerender(
      <FormulaEditor
        value='ab'
        references={[]}
        index={index}
        onChange={vi.fn()}
        onSubmit={second}
      />
    );

    mockState.commands.get(CTRL_CMD_ENTER)?.();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('turns a completed field name into a resolved reference', async () => {
    const onChange = vi.fn();
    render(<FormulaEditor value='SUM(' references={[]} index={index} onChange={onChange} />);
    await typeInMockEditor('SUM(clicks)');
    expect(onChange).toHaveBeenLastCalledWith({
      text: 'SUM(clicks)',
      refs: [expect.objectContaining({ text: 'clicks', start: 4, end: 10, field: 'clicks' })],
    });
  });

  it('drops a reference whose text the analyst edited into something unknown', async () => {
    const onChange = vi.fn();
    render(
      <FormulaEditor
        value='SUM(clicks)'
        references={[ref('clicks', 4, 10)]}
        index={index}
        onChange={onChange}
      />
    );
    await typeInMockEditor('SUM(clcks)');
    // Unresolvable text must NOT silently keep the old reference — the backend would then store a
    // tag for a field the analyst is no longer looking at.
    expect(onChange).toHaveBeenLastCalledWith({ text: 'SUM(clcks)', refs: [] });
  });

  it('drops a reference resolved as ambiguous rather than guessing a candidate', async () => {
    // A top-level field literally named "payload.value" can coexist with a struct "payload"
    // having a child "value" — both produce the dotted name "payload.value". Neither candidate
    // should win silently.
    const ambiguousIndex: ReferenceableField[] = [
      field({ name: 'payload.value', field: 'payload.value', type: 'STRING' }),
      field({ name: 'payload.value', field: 'payload.value', type: 'INTEGER' }),
    ];
    const onChange = vi.fn();
    render(<FormulaEditor value='' references={[]} index={ambiguousIndex} onChange={onChange} />);
    await typeInMockEditor('payload.value');
    expect(onChange).toHaveBeenLastCalledWith({ text: 'payload.value', refs: [] });
  });

  it('carries a reference forward through the component when its field goes missing from the index', async () => {
    // Wires formula-resolution.ts's previousRefs carry-forward through the `references` prop end
    // to end: the field "clicks" is no longer in `index` (e.g. disconnected), but the analyst's
    // edit did not touch that span, so the reference must survive instead of silently vanishing.
    const onChange = vi.fn();
    render(
      <FormulaEditor
        value='SUM(clicks)'
        references={[ref('clicks', 4, 10)]}
        index={[]}
        onChange={onChange}
      />
    );
    await typeInMockEditor('SUM(clicks) + 1');
    expect(onChange).toHaveBeenLastCalledWith({
      text: 'SUM(clicks) + 1',
      refs: [expect.objectContaining({ text: 'clicks', start: 4, end: 10, field: 'clicks' })],
    });
  });

  it('offers hidden fields in completions, marked as hidden', async () => {
    render(<FormulaEditor value='SUM(' references={[]} index={index} onChange={vi.fn()} />);
    expect(await completionLabels()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: { label: 'impressions', detail: '\u00A0INTEGER', description: 'hidden' },
        }),
      ])
    );
  });

  it('offers a visible field with its type as the completion detail', async () => {
    render(<FormulaEditor value='SUM(' references={[]} index={index} onChange={vi.fn()} />);
    expect(await completionLabels()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: { label: 'clicks', detail: '\u00A0INTEGER' } }),
      ])
    );
  });

  // Wiring only: that a calculated entry reaches the provider through the component like any
  // other. It builds its index literally, so it cannot see the index BUILDER change — the skip
  // living in `buildReferenceIndex` is pinned by that module's own spec and, end to end from real
  // schema fields, by `BaseSchemaTable.test.tsx`. What is here that is nowhere else is the level
  // travelling the component path into the menu.
  it('offers a calculated field of this Data Mart, carrying its level', async () => {
    const calculated: ReferenceableField[] = [
      field({ name: 'revenue', field: 'revenue', type: 'FLOAT', calculated: { level: 'metric' } }),
    ];
    render(
      <FormulaEditor
        value=''
        references={[]}
        index={[...index, ...calculated]}
        onChange={vi.fn()}
      />
    );
    expect(await completionLabels()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          // The type slot is pinned by the two tests above; what this one is for is the level.
          label: expect.objectContaining({
            label: 'revenue',
            description: 'aggregated formula',
          }),
        }),
      ])
    );
  });

  it('names the Data Mart a joined candidate comes from, and inserts its dotted path', async () => {
    const joined: ReferenceableField[] = [
      {
        name: 'orders.amount',
        path: 'orders',
        field: 'amount',
        type: 'FLOAT',
        isHidden: false,
        sourceLabel: 'Orders',
      },
    ];
    render(
      <FormulaEditor
        value='SUM('
        references={[]}
        index={[...index, ...joined]}
        onChange={vi.fn()}
      />
    );
    expect(await completionLabels()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: { label: 'orders.amount', detail: '\u00A0FLOAT', description: 'Orders' },
          insertText: 'orders.amount',
        }),
      ])
    );
  });

  it('turns a completed joined field name into a reference carrying its structural path', async () => {
    const joined: ReferenceableField[] = [
      { name: 'orders.amount', path: 'orders', field: 'amount', type: 'FLOAT', isHidden: false },
    ];
    const onChange = vi.fn();
    render(<FormulaEditor value='SUM(' references={[]} index={joined} onChange={onChange} />);
    await typeInMockEditor('SUM(orders.amount)');
    expect(onChange).toHaveBeenLastCalledWith({
      text: 'SUM(orders.amount)',
      refs: [expect.objectContaining({ text: 'orders.amount', path: 'orders', field: 'amount' })],
    });
  });

  // The dialect function list is required, and unguarded division was downgraded from
  // an error to a warning specifically because "the validator warns AND autocomplete offers the
  // guarded pattern". Only the warning half had shipped.
  describe('function and pattern completions', () => {
    it('offers the dialect functions it was given, as functions with a call snippet', async () => {
      render(
        <FormulaEditor
          value=''
          references={[]}
          index={index}
          functionNames={['AVG', 'SUM']}
          onChange={vi.fn()}
        />
      );

      expect(await completionLabels()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'SUM',
            insertText: 'SUM($0)',
            detail: 'aggregation',
            kind: 1,
          }),
          expect.objectContaining({ label: 'AVG', insertText: 'AVG($0)' }),
        ])
      );
    });

    it('offers the guarded-division pattern as a snippet', async () => {
      render(<FormulaEditor value='' references={[]} index={index} onChange={vi.fn()} />);

      expect(await completionLabels()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'guarded division',
            insertText: 'SUM(${1:numerator}) / NULLIF(SUM(${2:denominator}), 0)',
            kind: 27,
            insertTextRules: 4,
          }),
        ])
      );
    });

    // Fields are what an analyst types most, so they stay on top; the guarded pattern sits right
    // under them where it is discoverable, and the long function list comes last.
    it('sorts fields above the pattern above the functions', async () => {
      render(
        <FormulaEditor
          value=''
          references={[]}
          index={index}
          functionNames={['SUM']}
          onChange={vi.fn()}
        />
      );
      const suggestions = await completionLabels();
      const sortTextOf = (label: string) =>
        String(suggestions.find(s => nameOf(s) === label)?.sortText);

      expect(sortTextOf('clicks') < sortTextOf('guarded division')).toBe(true);
      expect(sortTextOf('guarded division') < sortTextOf('SUM')).toBe(true);
    });

    it('offers no functions when none are supplied', async () => {
      render(<FormulaEditor value='' references={[]} index={index} onChange={vi.fn()} />);

      expect((await completionLabels()).filter(s => s.detail === 'aggregation')).toEqual([]);
    });

    // The scalar group shipped behind the provider's fourth parameter with nothing passing
    // it. Without this prop the whole curated per-storage list is dead code.
    it('offers the scalar functions it was given, below the aggregates', async () => {
      render(
        <FormulaEditor
          value=''
          references={[]}
          index={index}
          functionNames={['SUM']}
          scalarFunctionNames={['COALESCE', 'CASE']}
          onChange={vi.fn()}
        />
      );
      const suggestions = await completionLabels();

      expect(suggestions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'COALESCE',
            insertText: 'COALESCE($0)',
            detail: 'function',
          }),
          // A keyword completes as a word, not as `CASE()`.
          expect.objectContaining({ label: 'CASE', insertText: 'CASE' }),
        ])
      );
      const sortTextOf = (label: string) =>
        String(suggestions.find(s => nameOf(s) === label)?.sortText);
      expect(sortTextOf('SUM') < sortTextOf('COALESCE')).toBe(true);
    });

    it('offers no scalar functions when the prop is omitted', async () => {
      render(<FormulaEditor value='' references={[]} index={index} onChange={vi.fn()} />);

      expect((await completionLabels()).filter(s => s.detail === 'function')).toEqual([]);
    });
  });

  it('triggers completion on a word character, never on "{{" — the analyst never types a tag', async () => {
    render(<FormulaEditor value='' references={[]} index={index} onChange={vi.fn()} />);
    await Promise.resolve();
    const provider = mockState.registeredProvider as CompletionProviderLike;
    expect(provider.triggerCharacters).toEqual(WORD_TRIGGER_CHARACTERS);
    expect(provider.triggerCharacters).not.toContain('{');
  });

  it('registers a completion provider on mount and disposes it on unmount', async () => {
    const { unmount } = render(
      <FormulaEditor value='' references={[]} index={index} onChange={vi.fn()} />
    );
    await Promise.resolve();
    expect(mockState.registeredProvider).not.toBeNull();
    const disposable = mockState.providerDisposable as DisposableLike;
    expect(disposable.dispose).not.toHaveBeenCalled();

    unmount();
    // Fails if FormulaEditor stops wiring `editor.onDidDispose(cleanupProvider)` — the mock's own
    // teardown only replays whatever the component actually registered via onDidDispose, it does
    // not call dispose() on its own.
    expect(disposable.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes the previous sql completion provider when a second formula editor mounts', async () => {
    // The Data Mart SQL definition editor also mounts with language='sql' on the same page.
    // Without a dedupe guard, an earlier FormulaEditor's provider stays registered and keeps
    // offering field completions into that unrelated editor too.
    render(<FormulaEditor value='' references={[]} index={index} onChange={vi.fn()} />);
    await Promise.resolve();
    const first = mockState.providerDisposables[0] as DisposableLike;
    expect(first.dispose).not.toHaveBeenCalled();

    render(<FormulaEditor value='' references={[]} index={index} onChange={vi.fn()} />);
    await Promise.resolve();

    expect(first.dispose).toHaveBeenCalledTimes(1);
  });

  // The product asked for Looker's behaviour: a squiggle on the token at fault AND the sentence
  // spelled out under the editor. Neither replaces the other — several violations carry no
  // locatable token at all, and a squiggle alone says nothing about what is wrong.
  describe('live problems', () => {
    const diagnostics = (overrides: Partial<FormulaDiagnostics> = {}): FormulaDiagnostics => ({
      errors: [],
      warnings: [],
      otherFieldErrors: [],
      isChecking: false,
      isStale: false,
      ...overrides,
    });

    /** As the backend sends one: the token it is about published as data, beside the sentence. */
    const violation = (message: string, subject?: string, field = 'ctr') => ({
      code: 'FORMULA_UNKNOWN_REFERENCE',
      field,
      message,
      subject,
    });

    const lastMarkers = (): MarkerLike[] =>
      mockState.markerCalls[mockState.markerCalls.length - 1]?.markers ?? [];

    it('marks the token an error names, and says what is wrong beneath the editor', () => {
      render(
        <FormulaEditor
          value='SUM(clicks)'
          references={[ref('clicks', 4, 10)]}
          index={index}
          onChange={vi.fn()}
          diagnostics={diagnostics({
            errors: [violation('`clicks` no longer exists in the Data Mart.', 'clicks')],
          })}
        />
      );

      expect(lastMarkers()).toEqual([
        {
          message: '`clicks` no longer exists in the Data Mart.',
          severity: 8,
          startLineNumber: 1,
          startColumn: 5,
          endLineNumber: 1,
          endColumn: 11,
        },
      ]);
      expect(screen.getByRole('status')).toHaveTextContent('no longer exists in the Data Mart');
    });

    it('marks a warning as a warning, not an error', () => {
      render(
        <FormulaEditor
          value='SUM(AVG(clicks))'
          references={[ref('clicks', 8, 14)]}
          index={index}
          onChange={vi.fn()}
          diagnostics={diagnostics({
            warnings: [violation('`SUM` contains another aggregation.', 'SUM')],
          })}
        />
      );

      expect(lastMarkers().map(marker => marker.severity)).toEqual([4]);
    });

    it('places the marker by the subject the backend published, not by the words around it', () => {
      // The wording is deliberately about a different name: if the marker still lands on the
      // subject, no rewording of a message can move it.
      render(
        <FormulaEditor
          value='SUM(impressions)'
          references={[ref('impressions', 4, 15)]}
          index={index}
          onChange={vi.fn()}
          diagnostics={diagnostics({
            errors: [violation('`clicks` no longer exists.', 'impressions')],
          })}
        />
      );

      expect(lastMarkers().map(marker => [marker.startColumn, marker.endColumn])).toEqual([
        [5, 16],
      ]);
    });

    it('still says what is wrong when the violation names nothing to point at', () => {
      render(
        <FormulaEditor
          value='SUM(clicks) / SUM(impressions)'
          references={[]}
          index={index}
          onChange={vi.fn()}
          diagnostics={diagnostics({
            warnings: [violation('This formula divides without guarding against a zero.')],
          })}
        />
      );

      expect(lastMarkers()).toEqual([]);
      expect(screen.getByRole('status')).toHaveTextContent('divides without guarding');
    });

    // Names the field and the consequence, never the cause: the wire carries no baseline, so this
    // same bucket holds a metric that was already broken before this editor opened.
    it('reports what would refuse the save elsewhere without marking up this formula', () => {
      render(
        <FormulaEditor
          value='SUM(clicks)'
          references={[ref('clicks', 4, 10)]}
          index={index}
          onChange={vi.fn()}
          diagnostics={diagnostics({
            otherFieldErrors: [
              violation('`clicks` is itself a calculated field.', 'clicks', 'roas'),
            ],
          })}
        />
      );

      expect(screen.getByRole('status')).toHaveTextContent('Saving will fail on roas');
      expect(screen.getByRole('status')).not.toHaveTextContent(/this will break/i);
      expect(lastMarkers()).toEqual([]);
    });

    it('clears the markers once the problems are gone', () => {
      const props = {
        value: 'SUM(clicks)',
        references: [ref('clicks', 4, 10)],
        index,
        onChange: vi.fn(),
      };
      const { rerender } = render(
        <FormulaEditor
          {...props}
          diagnostics={diagnostics({ errors: [violation('`clicks` no longer exists.', 'clicks')] })}
        />
      );
      expect(lastMarkers()).toHaveLength(1);

      rerender(<FormulaEditor {...props} diagnostics={diagnostics()} />);

      expect(lastMarkers()).toEqual([]);
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });

    // The verdict is kept on screen while the next one is fetched, so it outlives the text it was
    // given about. Markers must not: re-derived from the CURRENT text, a "wrap this in an
    // aggregation" squiggle would re-anchor onto the token the analyst just wrapped and accuse it
    // again, at full strength, for a debounce and a round trip.
    it('marks nothing while its verdict is about an older formula, but still says it', () => {
      render(
        <FormulaEditor
          value='SUM(clicks)'
          references={[ref('clicks', 4, 10)]}
          index={index}
          onChange={vi.fn()}
          diagnostics={diagnostics({
            errors: [violation('`clicks` is a row-level column.', 'clicks')],
            isStale: true,
            isChecking: true,
          })}
        />
      );

      expect(lastMarkers()).toEqual([]);
      expect(screen.getByRole('status')).toHaveTextContent('row-level column');
    });

    it('announces politely, and says when a newer answer is on its way', () => {
      const { rerender } = render(
        <FormulaEditor
          value='SUM(clicks)'
          references={[ref('clicks', 4, 10)]}
          index={index}
          onChange={vi.fn()}
          diagnostics={diagnostics({ isChecking: true })}
        />
      );

      // Mounted before it has anything to say: a live region that appears together with its first
      // content goes unannounced in several screen reader and browser pairings.
      const region = screen.getByRole('status');
      expect(region).toBeEmptyDOMElement();
      expect(region).toHaveAttribute('aria-busy', 'true');

      rerender(
        <FormulaEditor
          value='SUM(clicks)'
          references={[ref('clicks', 4, 10)]}
          index={index}
          onChange={vi.fn()}
          diagnostics={diagnostics({ errors: [violation('`clicks` is gone.', 'clicks')] })}
        />
      );
      expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'false');
    });

    it('marks nothing when the token the response named is no longer in the formula', () => {
      // The verdict is always about the text as it was a debounce and a round trip ago.
      render(
        <FormulaEditor
          value='SUM(impressions)'
          references={[ref('impressions', 4, 15)]}
          index={index}
          onChange={vi.fn()}
          diagnostics={diagnostics({ errors: [violation('`clicks` no longer exists.', 'clicks')] })}
        />
      );

      expect(lastMarkers()).toEqual([]);
      // Still said out loud: the analyst is entitled to know a check came back unhappy.
      expect(screen.getByRole('status')).toHaveTextContent('`clicks` no longer exists.');
    });

    it('says nothing at all when there is no verdict', () => {
      render(
        <FormulaEditor value='SUM(clicks)' references={[]} index={index} onChange={vi.fn()} />
      );

      expect(screen.getByRole('status')).toBeEmptyDOMElement();
      expect(lastMarkers()).toEqual([]);
    });
  });

  // A chip is decoration plus interception, and both are re-derived from `value` and `references`.
  // What these pin is the WIRING — that the editor fills the collection the interception reads, and
  // that a chip and the backend's squiggle over the same field can be on screen together. Whether
  // the caret, the selection and the paint then behave is measured in a real browser
  // (e2e/specs/datamart-calculated-field-chips.spec.ts); happy-dom has none of the three.
  describe('field chips', () => {
    it('draws a chip over each resolved reference', () => {
      render(
        <FormulaEditor
          value='SUM(clicks) / SUM(impressions)'
          references={[ref('clicks', 4, 10), ref('impressions', 18, 29)]}
          index={index}
          onChange={vi.fn()}
        />
      );

      expect(chipColumns()).toEqual([
        [5, 11],
        [19, 30],
      ]);
    });

    it('draws nothing over text that resolved to no reference', () => {
      render(<FormulaEditor value='SUM(clcks)' references={[]} index={index} onChange={vi.fn()} />);

      expect(chipColumns()).toEqual([]);
    });

    it('redraws the chips when the formula changes', () => {
      const props = { index, onChange: vi.fn() };
      const { rerender } = render(
        <FormulaEditor {...props} value='SUM(clicks)' references={[ref('clicks', 4, 10)]} />
      );
      expect(chipColumns()).toEqual([[5, 11]]);

      rerender(<FormulaEditor {...props} value='SUM(clcks)' references={[]} />);

      expect(chipColumns()).toEqual([]);
    });

    // The two are separate decoration owners on purpose: a field the backend blames still has to
    // read as a chip, and a chip must not swallow its own squiggle.
    it('keeps a chip and the error marker over the same field', () => {
      render(
        <FormulaEditor
          value='SUM(clicks)'
          references={[ref('clicks', 4, 10)]}
          index={index}
          onChange={vi.fn()}
          diagnostics={{
            errors: [
              {
                code: 'FORMULA_UNKNOWN_REFERENCE',
                field: 'ctr',
                message: '`clicks` no longer exists.',
                subject: 'clicks',
              },
            ],
            warnings: [],
            otherFieldErrors: [],
            isChecking: false,
            isStale: false,
          }}
        />
      );

      expect(chipColumns()).toEqual([[5, 11]]);
      expect(
        mockState.markerCalls[mockState.markerCalls.length - 1].markers.map(marker => [
          marker.startColumn,
          marker.endColumn,
        ])
      ).toEqual([[5, 11]]);
    });

    // The interception reads the collection this editor fills, not the props — end to end here,
    // because a getter wired to the wrong source passes both modules' own specs.
    it('removes the whole chip on a Backspace just after it', async () => {
      render(
        <FormulaEditor
          value='SUM(clicks)'
          references={[ref('clicks', 4, 10)]}
          index={index}
          onChange={vi.fn()}
        />
      );
      await Promise.resolve();
      mockState.caretColumn = 11;

      const event = pressInMockEditor('Backspace');

      expect(mockState.edits).toEqual([
        {
          range: { startLineNumber: 1, startColumn: 5, endLineNumber: 1, endColumn: 11 },
          text: '',
        },
      ]);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('leaves a Backspace away from every chip to Monaco', async () => {
      render(
        <FormulaEditor
          value='SUM(clicks)'
          references={[ref('clicks', 4, 10)]}
          index={index}
          onChange={vi.fn()}
        />
      );
      await Promise.resolve();
      mockState.caretColumn = 12;

      const event = pressInMockEditor('Backspace');

      expect(mockState.edits).toEqual([]);
      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  // The provider's own decisions are pinned in monaco-formula-hover.util.test.ts; this is the
  // wiring — that the editor hands it the reference index, which is the only thing that knows the
  // Data Mart behind an alias.
  describe('chip hover', () => {
    interface HoverProviderLike {
      provideHover: (
        model: unknown,
        position: { lineNumber: number; column: number }
      ) => { contents: { value: string }[] } | null;
    }

    const joinedIndex = [
      field({
        name: 'orders.amount',
        path: 'orders',
        field: 'amount',
        type: 'FLOAT',
        sourceLabel: 'Orders',
      }),
    ];
    const joinedRef: ResolvedReference = {
      text: 'orders.amount',
      start: 4,
      end: 17,
      path: 'orders',
      field: 'amount',
    };

    const hoverAt = (column: number) => {
      const provider = mockState.registeredHoverProvider as HoverProviderLike | null;
      return provider?.provideHover(mockState.model, { lineNumber: 1, column }) ?? null;
    };

    it('names the joined Data Mart a chip reads from', () => {
      render(
        <FormulaEditor
          value='SUM(orders.amount)'
          references={[joinedRef]}
          index={joinedIndex}
          onChange={vi.fn()}
        />
      );

      expect(hoverAt(8)?.contents[0].value).toBe(
        'amount from the joined Data Mart \u201COrders\u201D'
      );
    });

    // `revenue` and `clicks` are the same plain word on screen and are not written the same way —
    // one is already aggregated, the other must be wrapped. The chip is where that can be said.
    it('tells a chip on a calculated field that it already aggregates', () => {
      render(
        <FormulaEditor
          value='revenue / 2'
          references={[ref('revenue', 0, 7)]}
          index={[field({ name: 'revenue', field: 'revenue', calculated: { level: 'metric' } })]}
          onChange={vi.fn()}
        />
      );

      expect(hoverAt(3)?.contents[0].value).toBe(
        'revenue is a calculated field that already aggregates, so it cannot be wrapped in another ' +
          'aggregation.'
      );
    });

    it('says nothing over an ordinary own-Data-Mart chip, which needs no explaining', () => {
      render(
        <FormulaEditor
          value='SUM(clicks)'
          references={[ref('clicks', 4, 10)]}
          index={index}
          onChange={vi.fn()}
        />
      );

      expect(hoverAt(6)).toBeNull();
    });

    it('disposes the hover provider with the editor', () => {
      const { unmount } = render(
        <FormulaEditor
          value='SUM(orders.amount)'
          references={[joinedRef]}
          index={joinedIndex}
          onChange={vi.fn()}
        />
      );
      expect(mockState.registeredHoverProvider).not.toBeNull();

      unmount();

      // Every disposable the mock handed out, completion's and hover's alike.
      expect(mockState.providerDisposables.length).toBeGreaterThan(1);
      mockState.providerDisposables.forEach(disposable => {
        expect((disposable as DisposableLike).dispose).toHaveBeenCalled();
      });
    });
  });

  it('forwards ariaLabel to Monaco so the editor has an accessible name', () => {
    render(
      <FormulaEditor
        value=''
        references={[]}
        index={index}
        onChange={vi.fn()}
        ariaLabel='Formula'
      />
    );
    expect(mockState.latestOptions).toMatchObject({ ariaLabel: 'Formula' });
  });
});

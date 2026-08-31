import { useEffect, useMemo, useRef, useState } from 'react';
import { Editor, type OnMount } from '@monaco-editor/react';
import { cn } from '@owox/ui/lib/utils';
import { useTheme } from 'next-themes';
import type { FormulaViolationDto } from '../../../../shared/types/api';
import type { CalculatedFieldLevel } from '../../../../shared/types/data-mart-schema.types';
import type { ReferenceableField } from './formula-reference-index';
import type { ResolvedReference } from './formula-authoring';
import { resolveAll } from './formula-resolution';
import { chipDecorationsFor } from './formula-chip-decorations';
import { attachChipInteraction } from './formula-chip-interaction';
import { toLineColumn, violationRanges } from './formula-violation-ranges';
import type { FormulaDiagnostics } from './useFormulaDiagnostics';
import { registerFormulaCompletionProvider } from './monaco-formula-completion.util';
import { registerFormulaHoverProvider } from './monaco-formula-hover.util';
import {
  buildCalculatedFieldIndex,
  buildSourceLabelIndex,
  describeReferenceSource,
} from './formula-reference-source';
import { autoSizeSuggestWidget } from './monaco-suggest-width.util';
import type * as monacoEditor from 'monaco-editor';

/** Marker owner, so setting ours never clears whatever else annotates a `sql` model. */
const FORMULA_MARKER_OWNER = 'owox-calculated-field-formula';

const NO_VIOLATIONS: readonly FormulaViolationDto[] = [];

interface FormulaMessage {
  tone: 'error' | 'warning';
  text: string;
}

function markersFor(
  violations: readonly FormulaViolationDto[],
  severity: monacoEditor.MarkerSeverity,
  text: string,
  references: readonly ResolvedReference[]
): monacoEditor.editor.IMarkerData[] {
  return violations.flatMap(violation =>
    violationRanges(violation, text, references).map(range => {
      const start = toLineColumn(text, range.start);
      const end = toLineColumn(text, range.end);
      return {
        message: violation.message,
        severity,
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      };
    })
  );
}

export interface FormulaEditorProps {
  value: string;
  /**
   * The refs the parent currently believes hold for `value`, used to carry forward a reference whose
   * field went missing from `index` between renders as long as its span is untouched. Everything
   * else is re-derived from `index`, so an edited reference cannot survive as stale.
   */
  references: readonly ResolvedReference[];
  index: readonly ReferenceableField[];
  /**
   * The aggregate functions this Data Mart's warehouse dialect offers, as the BACKEND parser
   * recognizes them (`formula-function-dialects.ts`). Offered in autocomplete after the fields;
   * omit only where no storage is known, which offers none rather than guessing a dialect.
   */
  functionNames?: readonly string[];
  /**
   * The scalar functions to SUGGEST for this warehouse (`formula-scalar-functions.ts`), offered
   * last. A curated, deliberately incomplete list — never a claim about what the warehouse has, and
   * nothing here gates a save; omit it and the group is simply absent.
   */
  scalarFunctionNames?: readonly string[];
  onChange: (next: { text: string; refs: ResolvedReference[] }) => void;
  /**
   * Commit the buffer from the keyboard — `Ctrl`/`Cmd`+`Enter`, the same binding the plain textarea
   * this editor replaces already answers to.
   *
   * Without it the editor has no keyboard commit at all: Monaco takes `Tab` for indentation, so the
   * Apply button is unreachable from inside, and `Escape` reaches Cancel — the one action that
   * throws the work away. Omit it where there is nothing to commit to.
   */
  onSubmit?: () => void;
  height?: string | number;
  /** Accessible name for the editor, forwarded to Monaco's own `ariaLabel` option. */
  ariaLabel?: string;
  /**
   * What the backend makes of this formula. Shown as markers on the tokens at fault AND as text
   * beneath the editor — both, because a squiggle is easy to miss and the wire carries no range for
   * several violations at all.
   *
   * Never a gate: Apply is refused only by the synchronous local name check, so this may lag the
   * text on screen by a debounce and a round trip.
   */
  diagnostics?: FormulaDiagnostics;
}

/**
 * The formula editor an analyst types plain warehouse SQL into. Fully controlled — `value` and
 * `references` live in the parent, never mirrored locally — so a re-render can never show text out
 * of sync with what the parent believes is resolved.
 *
 * The analyst never types or sees a `{{ref}}` tag: that spelling is a storage detail owned by
 * `formula-authoring.ts`.
 */
export function FormulaEditor({
  value,
  references,
  index,
  functionNames,
  scalarFunctionNames,
  onChange,
  onSubmit,
  height = '140px',
  ariaLabel,
  diagnostics,
}: FormulaEditorProps) {
  const { resolvedTheme } = useTheme();
  const indexRef = useRef<readonly ReferenceableField[]>(index);
  indexRef.current = index;
  const referencesRef = useRef<readonly ResolvedReference[]>(references);
  referencesRef.current = references;
  // Read through a ref for the same reason `index` is: the provider is registered once on mount
  // and would otherwise close over the first render's list forever.
  const functionNamesRef = useRef<readonly string[]>(functionNames ?? []);
  functionNamesRef.current = functionNames ?? [];
  const scalarFunctionNamesRef = useRef<readonly string[]>(scalarFunctionNames ?? []);
  scalarFunctionNamesRef.current = scalarFunctionNames ?? [];
  // What a chip's hover says. Both derived from `index` rather than from `references`, which
  // carries a reference's path and field but neither the Data Mart behind an alias nor whether the
  // field it names is itself a formula.
  const sourceLabels = useMemo(() => buildSourceLabelIndex(index), [index]);
  const sourceLabelsRef = useRef<ReadonlyMap<string, string>>(sourceLabels);
  sourceLabelsRef.current = sourceLabels;
  const calculatedFields = useMemo(() => buildCalculatedFieldIndex(index), [index]);
  const calculatedFieldsRef =
    useRef<ReadonlyMap<string, { level?: CalculatedFieldLevel }>>(calculatedFields);
  calculatedFieldsRef.current = calculatedFields;

  // Through a ref for the same reason the index is: the command is registered once on mount and
  // would otherwise commit through the first render's callback for the editor's whole life.
  const onSubmitRef = useRef<(() => void) | undefined>(onSubmit);
  onSubmitRef.current = onSubmit;

  const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monacoEditor | null>(null);
  // The chips currently drawn. Kept as a collection rather than as ids because Monaco moves its
  // ranges through every edit, which is what lets the interception layer read them one keystroke
  // ahead of the re-render that will re-derive them.
  const chipsRef = useRef<monacoEditor.editor.IEditorDecorationsCollection | null>(null);
  // Host for Monaco's overflow widgets (the suggest list), created once and parked on `body` so it
  // sits outside the popover's transformed, clipping subtree. Monaco reparents its own widgets into
  // it; nothing else writes here. `null` under a DOM-less test environment, where the option is
  // simply omitted.
  const overflowHostRef = useRef<HTMLElement | null>(null);
  if (overflowHostRef.current === null && typeof document !== 'undefined') {
    const host = document.createElement('div');
    host.className = 'monaco-editor formula-editor-overflow-widgets';
    host.style.zIndex = '60';
    document.body.appendChild(host);
    overflowHostRef.current = host;
  }
  const overflowHost = overflowHostRef.current;
  // Re-attaches, not just detaches: React's development double-invoke runs this effect's cleanup
  // between two setups, and the host is created during RENDER (Monaco needs it in its options
  // before any effect of ours runs), so a cleanup-only effect left the node detached for good —
  // the suggest list then rendered into a node that is in no document, which looks exactly like
  // autocomplete not working. Same node throughout, since Monaco already holds a reference to it.
  useEffect(() => {
    const host = overflowHostRef.current;
    if (!host) return;
    if (!host.isConnected) document.body.appendChild(host);
    // The popover decides "outside" by DOM containment, and this host is deliberately outside it —
    // so a press on a suggestion, or on the widget's own resize handle, read as a click away and
    // closed the editor, discarding the edit. Bubble phase, so Monaco's handlers on the row have
    // already run; this only keeps the event from reaching the dismiss listener on `document`.
    const keepPopoverOpen = (event: Event) => {
      event.stopPropagation();
    };
    host.addEventListener('pointerdown', keepPopoverOpen);
    return () => {
      host.removeEventListener('pointerdown', keepPopoverOpen);
      host.remove();
    };
  }, []);
  // State, not just a ref: Monaco mounts AFTER the first commit, so the effect below has to be
  // given a reason to run again once there is a model to annotate.
  const [isEditorReady, setIsEditorReady] = useState(false);

  const errors = diagnostics?.errors ?? NO_VIOLATIONS;
  const warnings = diagnostics?.warnings ?? NO_VIOLATIONS;
  const otherFieldErrors = diagnostics?.otherFieldErrors ?? NO_VIOLATIONS;
  const isChecking = diagnostics?.isChecking ?? false;
  const isStale = diagnostics?.isStale ?? false;

  const handleMount: OnMount = (editor, monacoInstance) => {
    const cleanupProvider = registerFormulaCompletionProvider(
      monacoInstance as unknown as typeof monacoEditor,
      'sql',
      () => editor.getModel(),
      () => indexRef.current,
      () => functionNamesRef.current,
      () => scalarFunctionNamesRef.current
    );
    editor.onDidDispose(cleanupProvider);
    const cleanupHover = registerFormulaHoverProvider(
      monacoInstance as unknown as typeof monacoEditor,
      'sql',
      () => editor.getModel(),
      () => referencesRef.current,
      reference =>
        describeReferenceSource(reference, sourceLabelsRef.current, calculatedFieldsRef.current)
    );
    editor.onDidDispose(cleanupHover);
    if (overflowHost) {
      const stopAutoSize = autoSizeSuggestWidget(editor, overflowHost);
      editor.onDidDispose(stopAutoSize);
    }
    // The editor's only keyboard commit. Monaco owns `Tab`, so without this the Apply button is
    // unreachable without a pointer, and the one key that does escape the editor is `Escape` —
    // which cancels. Registered even when nothing is passed, so the binding never lands in the
    // model as a newline on one render and a commit on the next.
    const keys = monacoInstance as unknown as typeof monacoEditor;
    editor.addCommand(keys.KeyMod.CtrlCmd | keys.KeyCode.Enter, () => {
      onSubmitRef.current?.();
    });
    chipsRef.current = editor.createDecorationsCollection([]);
    const detachChips = attachChipInteraction(editor, () => chipsRef.current?.getRanges() ?? []);
    editor.onDidDispose(detachChips);
    editorRef.current = editor;
    monacoRef.current = monacoInstance as unknown as typeof monacoEditor;
    setIsEditorReady(true);
    // Monaco loads asynchronously, so by the time it exists the popover has long since placed
    // focus — on Cancel, the first focusable candidate. `EditableText`'s own focus effect cannot
    // help: it targets the built-in textarea, which this editor replaces, so on this path it is a
    // no-op. Without this a keyboard user opens the editor, types nothing (the keystrokes go to a
    // button), and presses Enter — which activates Cancel and discards the field.
    editor.focus();
  };

  // Ranges are re-derived from the text ON SCREEN, never remembered from the response, so a
  // violation about a token the analyst has since deleted marks nothing instead of leaving a
  // squiggle over whatever now occupies those offsets.
  //
  // A STALE verdict marks nothing at all: re-anchoring would put the "wrap this in an aggregation"
  // squiggle back onto the token the analyst just wrapped. The sentence stays, dimmed.
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;
    const markers = isStale
      ? []
      : [
          ...markersFor(errors, monaco.MarkerSeverity.Error, value, references),
          ...markersFor(warnings, monaco.MarkerSeverity.Warning, value, references),
        ];
    monaco.editor.setModelMarkers(model, FORMULA_MARKER_OWNER, markers);
  }, [isEditorReady, errors, warnings, isStale, value, references]);

  // Chips are re-derived from the text on screen and the parent's references, exactly like the
  // markers above and for the same reason: a chip holds no identity, so there is no state here to
  // fall out of step with the formula. `set` replaces the collection whole — a reference that
  // stopped resolving stops being drawn without anything having to remember it was ever a chip.
  useEffect(() => {
    chipsRef.current?.set(chipDecorationsFor(value, references));
  }, [isEditorReady, value, references]);

  const messages: FormulaMessage[] = [
    ...errors.map((violation): FormulaMessage => ({ tone: 'error', text: violation.message })),
    ...warnings.map((violation): FormulaMessage => ({ tone: 'warning', text: violation.message })),
    // Not a problem with the formula on screen, so it names the OTHER metric and marks nothing here.
    //
    // "will fail on", not "this will break": the wire carries no baseline, so a metric already
    // broken before this editor opened arrives in the same bucket. What every entry establishes is
    // that the save is refused and which field refuses it, never which edit caused it.
    ...otherFieldErrors.map(
      (violation): FormulaMessage => ({
        tone: 'warning',
        text: `Saving will fail on ${violation.field}: ${violation.message}`,
      })
    ),
  ];

  /**
   * Memoised because `@monaco-editor/react` diffs this by identity: a fresh literal makes it call
   * `editor.updateOptions()` on every render, and the editor re-renders on every keystroke.
   */
  const editorOptions = useMemo(
    () => ({
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: 'on' as const,
      automaticLayout: true,
      overviewRulerBorder: false,
      overviewRulerLanes: 0,
      lineNumbers: 'off' as const,
      folding: false,
      glyphMargin: false,
      // The suggest widget renders inside the editor's DOM by default, and this editor lives in an
      // `overflow-hidden` wrapper inside a popover, so the list was drawn and clipped —
      // indistinguishable from autocomplete not working.
      //
      // `fixedOverflowWidgets` alone does NOT fix it: it makes the widget `position: fixed`, and
      // the Radix popover animates with `transform`, which turns a transformed ancestor into the
      // containing block. The container has to leave the popover's subtree entirely.
      fixedOverflowWidgets: true,
      overflowWidgetsDomNode: overflowHost ?? undefined,
      ariaLabel,
    }),
    [overflowHost, ariaLabel]
  );

  const handleChange = (nextValue: string | undefined) => {
    const text = nextValue ?? '';
    onChange({ text, refs: resolveAll(text, indexRef.current, referencesRef.current) });
  };

  return (
    <div>
      <div
        className='nokey overflow-hidden rounded-md border border-gray-200 shadow-xs dark:border-gray-200/4'
        style={{ height }}
      >
        <Editor
          className='h-full w-full'
          height='100%'
          language='sql'
          value={value}
          onChange={handleChange}
          onMount={handleMount}
          theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
          options={editorOptions}
        />
      </div>
      {/*
        `status`, not `alert`: this updates as the analyst types, and an assertive live region
        would interrupt a screen reader on every verdict. Mounted EMPTY rather than conditionally,
        because a live region that appears together with its first content is not announced by
        several screen reader and browser pairings — the region has to be there before the text is.
        `aria-busy` carries the same "a newer answer is coming" the dimming shows sighted readers.
      */}
      <ul
        role='status'
        aria-busy={isChecking}
        data-testid='formula-diagnostics'
        className={cn(
          'space-y-1 text-xs whitespace-normal',
          messages.length > 0 && 'mt-2',
          isChecking && 'opacity-60'
        )}
      >
        {messages.map((message, index) => (
          // Messages are not unique across violations; index is the only stable key here.
          <li
            key={index}
            className={
              message.tone === 'error' ? 'text-destructive' : 'text-amber-700 dark:text-amber-300'
            }
          >
            {message.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

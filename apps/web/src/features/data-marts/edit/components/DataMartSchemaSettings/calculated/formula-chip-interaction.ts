/**
 * What makes a field chip ATOMIC: the caret never lands inside one, `Backspace`/`Delete` beside one
 * removes all of it, and a selection never covers half of it. Monaco offers none of this — a
 * decoration is paint, not structure — so it is caret, selection and key interception.
 *
 * Caret corrections never go through `executeEdits`: that would put a no-op step on the undo stack
 * and Ctrl+Z would start undoing cursor movements. Only a chip deletion edits, once, between two
 * undo stops.
 *
 * Chip ranges are read from the decorations collection on every event rather than cached, so this
 * layer is never a keystroke behind what is drawn.
 */

import type * as monaco from 'monaco-editor';

/** Half-open [start, end) offsets into the model's text. */
interface ChipSpan {
  start: number;
  end: number;
}

/**
 * The parts of Monaco the interception needs, named structurally so this module compiles without
 * importing the editor and can be driven by a fake in a test. A real
 * `monaco.editor.IStandaloneCodeEditor` satisfies it as it is.
 */
export interface ChipInteractionEditor {
  getModel(): ChipInteractionModel | null;
  getSelection(): ChipInteractionSelection | null;
  setSelection(selection: monaco.ISelection): void;
  executeEdits(source: string, edits: { range: monaco.IRange; text: string | null }[]): boolean;
  pushUndoStop(): boolean;
  onKeyDown(listener: (event: ChipKeyboardEvent) => void): monaco.IDisposable;
  onDidChangeCursorSelection(listener: (event: { source: string }) => void): monaco.IDisposable;
  onMouseDown(listener: () => void): monaco.IDisposable;
  onMouseUp(listener: () => void): monaco.IDisposable;
}

export interface ChipInteractionModel {
  getOffsetAt(position: monaco.IPosition): number;
  getPositionAt(offset: number): monaco.IPosition;
}

export interface ChipInteractionSelection {
  selectionStartLineNumber: number;
  selectionStartColumn: number;
  positionLineNumber: number;
  positionColumn: number;
}

export interface ChipKeyboardEvent {
  readonly browserEvent: {
    readonly key: string;
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
    readonly altKey: boolean;
    readonly shiftKey: boolean;
  };
  preventDefault(): void;
  stopPropagation(): void;
}

/** Names our edit in Monaco's own cursor-change events, so it is told apart from the analyst's. */
const CHIP_EDIT_SOURCE = 'formulaChip';

function offsetOf(model: ChipInteractionModel, lineNumber: number, column: number): number {
  return model.getOffsetAt({ lineNumber, column });
}

/** The chip an offset falls STRICTLY inside — a boundary belongs to nobody. */
function chipAround(chips: readonly ChipSpan[], offset: number): ChipSpan | null {
  return chips.find(chip => offset > chip.start && offset < chip.end) ?? null;
}

/**
 * Draws the caret out of a chip it landed in.
 *
 * Which way out is the direction it was travelling: stepping right out of `clicks` must leave the
 * caret after the chip, not back where it started, or the arrow key would look broken. A click has
 * no direction, so it goes to whichever edge it landed nearer.
 */
function escapeChip(chip: ChipSpan, offset: number, from: number | null): number {
  if (from !== null && from !== offset) return offset > from ? chip.end : chip.start;
  return offset - chip.start <= chip.end - offset ? chip.start : chip.end;
}

export function attachChipInteraction(
  editor: ChipInteractionEditor,
  getRanges: () => readonly monaco.IRange[]
): () => void {
  // Our own setSelection makes Monaco emit again, straight back into the handler that called it.
  let isSnapping = false;
  let isPointerDown = false;
  /** Where the caret was before the move being handled, which is the only source of direction. */
  let lastOffset: number | null = null;

  const chipsOf = (model: ChipInteractionModel): ChipSpan[] =>
    getRanges()
      .map(range => ({
        start: offsetOf(model, range.startLineNumber, range.startColumn),
        end: offsetOf(model, range.endLineNumber, range.endColumn),
      }))
      // A decoration whose text was deleted collapses to an empty range and lingers in the
      // collection until the next render re-sets it; it is no longer a chip.
      .filter(chip => chip.end > chip.start);

  const snap = (fromPointer: boolean) => {
    const model = editor.getModel();
    const selection = editor.getSelection();
    if (!model || !selection) return;

    const anchor = offsetOf(model, selection.selectionStartLineNumber, selection.selectionStartColumn); // prettier-ignore
    const head = offsetOf(model, selection.positionLineNumber, selection.positionColumn);
    const chips = chipsOf(model);

    let nextAnchor = anchor;
    let nextHead = head;
    if (anchor === head) {
      const chip = chipAround(chips, head);
      if (chip) nextAnchor = nextHead = escapeChip(chip, head, fromPointer ? null : lastOffset);
    } else {
      // The anchor is the end the analyst is not moving, so it is pushed AWAY from the head: a
      // selection begun mid-chip (a drag started inside one) ends up covering the whole of it.
      const anchorChip = chipAround(chips, anchor);
      if (anchorChip) nextAnchor = anchor > head ? anchorChip.end : anchorChip.start;

      // The head is the end that moved, and it leaves a chip the way it came in — the same rule the
      // collapsed caret follows. Growing it outward unconditionally is what made Shift+Arrow go
      // dead at a chip boundary: a head shrinking the selection back over a chip was pushed
      // straight out again, so the key did nothing at all and the analyst had to reach for the
      // mouse. With no direction to read (a mouse drag, or a selection that appeared whole) it
      // still grows away from the anchor, which is what a drag across a chip should do.
      const headChip = chipAround(chips, head);
      if (headChip) {
        const from =
          !fromPointer && lastOffset !== null && lastOffset !== head ? lastOffset : anchor;
        nextHead = head > from ? headChip.end : headChip.start;
      }
    }

    lastOffset = nextHead;
    if (nextAnchor === anchor && nextHead === head) return;

    const anchorPosition = model.getPositionAt(nextAnchor);
    const headPosition = model.getPositionAt(nextHead);
    isSnapping = true;
    try {
      editor.setSelection({
        selectionStartLineNumber: anchorPosition.lineNumber,
        selectionStartColumn: anchorPosition.column,
        positionLineNumber: headPosition.lineNumber,
        positionColumn: headPosition.column,
      });
    } finally {
      isSnapping = false;
    }
  };

  const disposables = [
    editor.onDidChangeCursorSelection(event => {
      if (isSnapping) return;
      // The safety valve on the latch below. `onMouseDown` fires for EVERY press on the editor —
      // right-click, gutter, widget — while `onMouseUp` only fires for a release delivered back to
      // the view node, so a right-click released elsewhere, or a `pointercancel`, would otherwise
      // leave the latch set and every snap silently off for the rest of the editor's life. A
      // selection change that did not come from the mouse is proof that no drag is in progress.
      if (event.source !== 'mouse') isPointerDown = false;
      // Monaco recomputes a dragged selection from the press point on every mouse move, so a snap
      // applied mid-drag is thrown away and re-applied continuously — the selection stutters and
      // the drag feels like it is being fought. The settled selection is the one worth correcting.
      if (isPointerDown) return;
      snap(event.source === 'mouse');
    }),
    editor.onMouseDown(() => {
      isPointerDown = true;
    }),
    editor.onMouseUp(() => {
      isPointerDown = false;
      snap(true);
    }),
    editor.onKeyDown(event => {
      const { key, ctrlKey, metaKey, altKey, shiftKey } = event.browserEvent;
      if (key !== 'Backspace' && key !== 'Delete') return;
      // A word- or line-wise delete is left alone rather than re-implemented with worse boundaries.
      // Its worst outcome is a chip broken into plain text carrying an error, which is the state
      // the design already chose for an edited reference — not a half-reference that still saves.
      if (ctrlKey || metaKey || altKey || shiftKey) return;

      const model = editor.getModel();
      const selection = editor.getSelection();
      if (!model || !selection) return;
      const anchor = offsetOf(model, selection.selectionStartLineNumber, selection.selectionStartColumn); // prettier-ignore
      const head = offsetOf(model, selection.positionLineNumber, selection.positionColumn);
      // A ranged selection has already been snapped to whole chips, so Monaco's own delete of it
      // takes whole chips too.
      if (anchor !== head) return;

      const chips = chipsOf(model);
      const chip =
        key === 'Backspace'
          ? chips.find(candidate => candidate.end === head)
          : chips.find(candidate => candidate.start === head);
      if (!chip) return;

      event.preventDefault();
      // Monaco's own `deleteLeft`/`deleteRight` are dispatched by the keybinding service listening
      // further up the DOM than this handler; without stopping the event there, a second character
      // would go with the chip.
      event.stopPropagation();

      const start = model.getPositionAt(chip.start);
      const end = model.getPositionAt(chip.end);
      editor.pushUndoStop();
      editor.executeEdits(CHIP_EDIT_SOURCE, [
        {
          range: {
            startLineNumber: start.lineNumber,
            startColumn: start.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column,
          },
          text: '',
        },
      ]);
      editor.pushUndoStop();
      // Under the same re-entrancy guard `snap` uses: the caret is being put where this handler
      // already knows it belongs, and there is nothing left to snap it to.
      lastOffset = chip.start;
      isSnapping = true;
      try {
        editor.setSelection({
          selectionStartLineNumber: start.lineNumber,
          selectionStartColumn: start.column,
          positionLineNumber: start.lineNumber,
          positionColumn: start.column,
        });
      } finally {
        isSnapping = false;
      }
    }),
  ];

  return () => {
    disposables.forEach(disposable => {
      disposable.dispose();
    });
  };
}

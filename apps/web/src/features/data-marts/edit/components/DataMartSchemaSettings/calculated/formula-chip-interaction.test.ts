import { describe, it, expect, vi } from 'vitest';
import { attachChipInteraction } from './formula-chip-interaction';
import type {
  ChipInteractionEditor,
  ChipInteractionSelection,
  ChipKeyboardEvent,
} from './formula-chip-interaction';

/**
 * A stand-in for Monaco's editor and model.
 *
 * Written by hand rather than driven against the real thing on purpose: `monaco-editor` is not a
 * dependency of this app at all — `@monaco-editor/react` fetches it from a CDN at run time — so
 * there is no editor to import here, and a bundled one would still have no layout, no caret and no
 * key handling under happy-dom. What this fake pins is the DECISIONS the module makes: where the
 * caret is put, which range is deleted, and what it declines to touch. That the browser then
 * behaves is the Playwright spec's job (e2e/specs/datamart-calculated-field-chips.spec.ts).
 */
class FakeEditor {
  text: string;
  /** Half-open [anchor, head) in offsets; anchor > head when the selection runs backwards. */
  anchor = 0;
  head = 0;
  chips: { start: number; end: number }[] = [];
  /** Every call the module made that changes the document, in order. */
  log: string[] = [];
  edits: { start: number; end: number; text: string | null }[] = [];
  disposed = 0;

  private keyListeners: ((e: ChipKeyboardEvent) => void)[] = [];
  private selectionListeners: ((e: { source: string }) => void)[] = [];
  private mouseDownListeners: (() => void)[] = [];
  private mouseUpListeners: (() => void)[] = [];

  constructor(text: string) {
    this.text = text;
  }

  private positionAt(offset: number) {
    const clamped = Math.max(0, Math.min(offset, this.text.length));
    const before = this.text.slice(0, clamped);
    const lastBreak = before.lastIndexOf('\n');
    return { lineNumber: before.split('\n').length, column: clamped - lastBreak };
  }

  private offsetAt(position: { lineNumber: number; column: number }) {
    const lines = this.text.split('\n');
    let offset = 0;
    for (let i = 0; i < position.lineNumber - 1; i++) offset += lines[i].length + 1;
    return offset + position.column - 1;
  }

  readonly editor: ChipInteractionEditor = {
    getModel: () => ({
      getOffsetAt: (position: { lineNumber: number; column: number }) => this.offsetAt(position),
      getPositionAt: (offset: number) => this.positionAt(offset),
    }),
    getSelection: (): ChipInteractionSelection => {
      const anchor = this.positionAt(this.anchor);
      const head = this.positionAt(this.head);
      return {
        selectionStartLineNumber: anchor.lineNumber,
        selectionStartColumn: anchor.column,
        positionLineNumber: head.lineNumber,
        positionColumn: head.column,
      };
    },
    setSelection: selection => {
      this.anchor = this.offsetAt({
        lineNumber: selection.selectionStartLineNumber,
        column: selection.selectionStartColumn,
      });
      this.head = this.offsetAt({
        lineNumber: selection.positionLineNumber,
        column: selection.positionColumn,
      });
      this.log.push(`select ${String(this.anchor)}..${String(this.head)}`);
      // The real editor emits synchronously from setSelection, which is what would send a naive
      // handler round again — so the fake does too.
      this.selectionListeners.forEach(listener => {
        listener({ source: 'api' });
      });
    },
    executeEdits: (_source, edits) => {
      for (const edit of edits) {
        const start = this.offsetAt({
          lineNumber: edit.range.startLineNumber,
          column: edit.range.startColumn,
        });
        const end = this.offsetAt({
          lineNumber: edit.range.endLineNumber,
          column: edit.range.endColumn,
        });
        this.edits.push({ start, end, text: edit.text });
        this.text = this.text.slice(0, start) + (edit.text ?? '') + this.text.slice(end);
        this.anchor = this.head = start + (edit.text ?? '').length;
      }
      this.log.push('edit');
      return true;
    },
    pushUndoStop: () => {
      this.log.push('undo-stop');
      return true;
    },
    onKeyDown: listener => {
      this.keyListeners.push(listener);
      return { dispose: () => this.disposed++ };
    },
    onDidChangeCursorSelection: listener => {
      this.selectionListeners.push(listener);
      return { dispose: () => this.disposed++ };
    },
    onMouseDown: listener => {
      this.mouseDownListeners.push(listener);
      return { dispose: () => this.disposed++ };
    },
    onMouseUp: listener => {
      this.mouseUpListeners.push(listener);
      return { dispose: () => this.disposed++ };
    },
  };

  /** The chip ranges the decorations collection would report for `chips`. */
  getRanges = () =>
    this.chips.map(chip => {
      const start = this.positionAt(chip.start);
      const end = this.positionAt(chip.end);
      return {
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      };
    });

  moveCaretTo(offset: number, source = 'keyboard') {
    this.anchor = this.head = offset;
    this.selectionListeners.forEach(listener => {
      listener({ source });
    });
  }

  selectTo(anchor: number, head: number, source = 'keyboard') {
    this.anchor = anchor;
    this.head = head;
    this.selectionListeners.forEach(listener => {
      listener({ source });
    });
  }

  mouseDown() {
    this.mouseDownListeners.forEach(listener => {
      listener();
    });
  }

  mouseUp() {
    this.mouseUpListeners.forEach(listener => {
      listener();
    });
  }

  press(key: string, modifiers: Partial<KeyboardEvent> = {}) {
    const event = {
      browserEvent: {
        key,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        ...modifiers,
      },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    this.keyListeners.forEach(listener => {
      listener(event);
    });
    return event;
  }
}

/** `SUM(clicks)` with `clicks` — offsets 4..10 — resolved. */
function editorWithOneChip() {
  const fake = new FakeEditor('SUM(clicks)');
  fake.chips = [{ start: 4, end: 10 }];
  return fake;
}

describe('attachChipInteraction', () => {
  describe('the caret never lands inside a chip', () => {
    it('jumps past the chip when the caret moves into it from the left', () => {
      const fake = editorWithOneChip();
      attachChipInteraction(fake.editor, fake.getRanges);

      fake.moveCaretTo(4);
      fake.moveCaretTo(5);

      expect(fake.head).toBe(10);
    });

    it('jumps before the chip when the caret moves into it from the right', () => {
      const fake = editorWithOneChip();
      attachChipInteraction(fake.editor, fake.getRanges);

      fake.moveCaretTo(10);
      fake.moveCaretTo(9);

      expect(fake.head).toBe(4);
    });

    it('snaps a click inside a chip to the boundary it landed nearer to', () => {
      const fake = editorWithOneChip();
      attachChipInteraction(fake.editor, fake.getRanges);

      fake.mouseDown();
      fake.moveCaretTo(9, 'mouse');
      fake.mouseUp();

      expect(fake.head).toBe(10);
    });

    it('leaves the caret alone on a chip boundary', () => {
      const fake = editorWithOneChip();
      attachChipInteraction(fake.editor, fake.getRanges);

      fake.moveCaretTo(4);
      expect(fake.log).toEqual([]);
      fake.moveCaretTo(10);
      expect(fake.log).toEqual([]);
    });

    // A caret move that edited the model would put a no-op step on the undo stack, so Ctrl+Z would
    // undo "moving the caret" before it undid anything the analyst typed.
    it('moves the caret without touching the model', () => {
      const fake = editorWithOneChip();
      attachChipInteraction(fake.editor, fake.getRanges);

      fake.moveCaretTo(4);
      fake.moveCaretTo(5);

      expect(fake.edits).toEqual([]);
      expect(fake.log).toEqual(['select 10..10']);
      expect(fake.text).toBe('SUM(clicks)');
    });
  });

  describe('Backspace and Delete take the whole chip', () => {
    it('removes the whole chip on Backspace just after it', () => {
      const fake = editorWithOneChip();
      attachChipInteraction(fake.editor, fake.getRanges);
      fake.moveCaretTo(10);

      const event = fake.press('Backspace');

      expect(fake.text).toBe('SUM()');
      expect(fake.head).toBe(4);
      expect(event.preventDefault).toHaveBeenCalled();
      // Monaco's own `deleteLeft` runs from the keybinding service further up the DOM; without
      // this it would delete a second character after ours.
      expect(event.stopPropagation).toHaveBeenCalled();
    });

    it('removes the whole chip on Delete just before it', () => {
      const fake = editorWithOneChip();
      attachChipInteraction(fake.editor, fake.getRanges);
      fake.moveCaretTo(4);

      const event = fake.press('Delete');

      expect(fake.text).toBe('SUM()');
      expect(fake.head).toBe(4);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    // One `executeEdits` between two undo stops: a single Ctrl+Z brings the whole chip back, and
    // brings back nothing else the analyst typed before it.
    it('deletes a chip as exactly one undo unit', () => {
      const fake = editorWithOneChip();
      attachChipInteraction(fake.editor, fake.getRanges);
      fake.moveCaretTo(10);

      fake.press('Backspace');

      expect(fake.edits).toEqual([{ start: 4, end: 10, text: '' }]);
      expect(fake.log.filter(entry => entry !== 'select 4..4')).toEqual([
        'undo-stop',
        'edit',
        'undo-stop',
      ]);
    });

    it('leaves a Backspace that touches no chip to Monaco', () => {
      const fake = editorWithOneChip();
      attachChipInteraction(fake.editor, fake.getRanges);
      fake.moveCaretTo(11);

      const event = fake.press('Backspace');

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(fake.text).toBe('SUM(clicks)');
    });

    it('leaves a Delete that touches no chip to Monaco', () => {
      const fake = editorWithOneChip();
      attachChipInteraction(fake.editor, fake.getRanges);
      fake.moveCaretTo(0);

      const event = fake.press('Delete');

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(fake.text).toBe('SUM(clicks)');
    });

    // A ranged selection has already been snapped to whole chips, so Monaco's own delete removes
    // whole chips too — and re-implementing word- or line-wise delete here would only get their
    // boundaries wrong.
    it('leaves a delete with a selection, or with a modifier held, to Monaco', () => {
      const fake = editorWithOneChip();
      attachChipInteraction(fake.editor, fake.getRanges);

      fake.selectTo(4, 10);
      expect(fake.press('Backspace').preventDefault).not.toHaveBeenCalled();

      fake.moveCaretTo(10);
      expect(fake.press('Backspace', { altKey: true }).preventDefault).not.toHaveBeenCalled();
      expect(fake.press('Backspace', { ctrlKey: true }).preventDefault).not.toHaveBeenCalled();
      expect(fake.press('Backspace', { metaKey: true }).preventDefault).not.toHaveBeenCalled();
      expect(fake.text).toBe('SUM(clicks)');
    });

    it('ignores every other key', () => {
      const fake = editorWithOneChip();
      attachChipInteraction(fake.editor, fake.getRanges);
      fake.moveCaretTo(10);

      expect(fake.press('a').preventDefault).not.toHaveBeenCalled();
      expect(fake.press('ArrowLeft').preventDefault).not.toHaveBeenCalled();
      expect(fake.text).toBe('SUM(clicks)');
    });
  });

  describe('a selection never covers half a chip', () => {
    it('grows a selection that ends inside a chip out to the chip', () => {
      const fake = editorWithOneChip();
      attachChipInteraction(fake.editor, fake.getRanges);

      fake.selectTo(4, 6);

      expect([fake.anchor, fake.head]).toEqual([4, 10]);
    });

    it('grows a selection that starts inside a chip out to the chip', () => {
      const fake = editorWithOneChip();
      attachChipInteraction(fake.editor, fake.getRanges);

      fake.selectTo(7, 11);

      expect([fake.anchor, fake.head]).toEqual([4, 11]);
    });

    it('keeps a backwards selection running backwards', () => {
      const fake = editorWithOneChip();
      attachChipInteraction(fake.editor, fake.getRanges);

      fake.selectTo(11, 7);

      expect([fake.anchor, fake.head]).toEqual([11, 4]);
    });

    // The other half of atomicity, and the one that is easy to miss: a selection has to be able to
    // come back OFF a chip. Growing the head outward whatever direction it moved in made
    // Shift+Arrow inert at a chip boundary — the key did nothing at all and the analyst had to
    // reach for the mouse.
    //
    // These two are also the ONLY cases that pin the direction term (`lastOffset` over `anchor`),
    // and no grow can join them: reading the direction and growing away from the anchor differ
    // exactly when the head moves TOWARD the anchor, which is what a shrink is. Verified by
    // mutation — `from = anchor` fails these two and nothing else.
    it('shrinks a selection back off a chip when the head moves toward the anchor', () => {
      const fake = editorWithOneChip();
      attachChipInteraction(fake.editor, fake.getRanges);

      fake.selectTo(0, 11);
      fake.selectTo(0, 10);
      fake.selectTo(0, 9);

      expect([fake.anchor, fake.head]).toEqual([0, 4]);
    });

    it('shrinks a backwards selection back off a chip the same way', () => {
      const fake = editorWithOneChip();
      attachChipInteraction(fake.editor, fake.getRanges);

      fake.selectTo(11, 4);
      fake.selectTo(11, 5);

      expect([fake.anchor, fake.head]).toEqual([11, 10]);
    });

    // A chip can appear AROUND a caret that never moved: the analyst finishes typing a field name,
    // the parent re-renders, and the decoration now spans the offset the caret is sitting at. The
    // direction left over from before is that same offset, which says nothing about where the head
    // is going — so the selection has to grow away from the anchor rather than collapse toward it.
    it('grows away from the anchor when a chip forms around a caret that has not moved', () => {
      const fake = new FakeEditor('SUM(clicks)');
      attachChipInteraction(fake.editor, fake.getRanges);
      fake.moveCaretTo(7);

      fake.chips = [{ start: 4, end: 10 }];
      fake.selectTo(0, 7);

      expect([fake.anchor, fake.head]).toEqual([0, 10]);
    });

    it('leaves a selection that already covers whole chips alone', () => {
      const fake = editorWithOneChip();
      attachChipInteraction(fake.editor, fake.getRanges);

      fake.selectTo(0, 11);

      expect(fake.log).toEqual([]);
    });

    // Snapping on every event during a drag fights the drag: Monaco recomputes the selection from
    // the press point on each mouse move, so each snap is immediately undone and the selection
    // visibly stutters. The settled selection is the one worth correcting.
    it('waits for the mouse to be released before snapping a dragged selection', () => {
      const fake = editorWithOneChip();
      attachChipInteraction(fake.editor, fake.getRanges);

      // Primed on the far side of the chip first, so the direction left over from the KEYBOARD is
      // the opposite of the drag's. A drag has no direction to inherit — it grows away from where
      // it was begun — and reading a stale one here would select `SUM(` and leave the chip the
      // analyst dragged across out of the selection.
      fake.moveCaretTo(11);

      fake.mouseDown();
      fake.selectTo(0, 6, 'mouse');
      expect([fake.anchor, fake.head]).toEqual([0, 6]);

      fake.mouseUp();
      expect([fake.anchor, fake.head]).toEqual([0, 10]);
    });
  });

  // `onMouseDown` fires for every press on the editor, `onMouseUp` only for a release the view node
  // gets back. A right-click released elsewhere would otherwise leave the deferral latched and
  // every snap silently off until the next full click cycle inside the editor.
  it('recovers from a mouse press whose release the editor never saw', () => {
    const fake = editorWithOneChip();
    attachChipInteraction(fake.editor, fake.getRanges);
    fake.moveCaretTo(4);

    fake.mouseDown();
    fake.moveCaretTo(5);

    expect(fake.head).toBe(10);
  });

  it('does nothing at all when there are no chips', () => {
    const fake = new FakeEditor('SUM(clicks)');
    attachChipInteraction(fake.editor, fake.getRanges);

    fake.moveCaretTo(7);
    fake.press('Backspace');
    fake.selectTo(5, 8);

    expect(fake.log).toEqual([]);
    expect(fake.text).toBe('SUM(clicks)');
  });

  it('handles a chip on the second line by offset, not by column', () => {
    const fake = new FakeEditor('SUM(a)\n+ clicks');
    fake.chips = [{ start: 9, end: 15 }];
    attachChipInteraction(fake.editor, fake.getRanges);

    fake.moveCaretTo(9);
    fake.moveCaretTo(10);

    expect(fake.head).toBe(15);
  });

  it('stops listening once disposed', () => {
    const fake = editorWithOneChip();
    const detach = attachChipInteraction(fake.editor, fake.getRanges);

    detach();

    expect(fake.disposed).toBe(4);
  });
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as Monaco from 'monaco-editor';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@owox/ui/components/sheet';
import { DataMartMentionPicker } from './DataMartMentionPicker';
import { preventSheetDismissWhileSuggesting } from './description-editor-escape';

const loaders = vi.hoisted(() => ({ marts: vi.fn(), fields: vi.fn() }));
vi.mock('./useDataMartReferences', () => ({
  useDataMartReferences: () => loaders.marts,
  useDataMartFieldReferences: () => loaders.fields,
}));

function harness(text = 'Use @') {
  let change: (event: Monaco.editor.IModelContentChangedEvent) => void = vi.fn();
  let cursorChange = () => {};
  let value = text;
  let caret = text.length;
  const node = document.createElement('div');
  document.body.append(node);
  const model = {
    getValueInRange: (range: Monaco.IRange) =>
      value.slice(range.startColumn - 1, range.endColumn - 1),
    getPositionAt: (offset: number) => ({ lineNumber: 1, column: offset + 1 }),
    getOffsetAt: (position: Monaco.IPosition) => position.column - 1,
  };
  const remove = vi.fn((widget: Monaco.editor.IContentWidget) => {
    widget.getDomNode().remove();
  });
  const edits = vi.fn((_source: string, items: { range: Monaco.IRange; text: string }[]) => {
    const { range, text } = items[0];
    value = value.slice(0, range.startColumn - 1) + text + value.slice(range.endColumn - 1);
  });
  const editor = {
    getModel: () => model,
    getPosition: () => ({ lineNumber: 1, column: caret + 1 }),
    hasTextFocus: () => !document.activeElement?.closest('[data-description-mention-picker]'),
    addContentWidget: (widget: Monaco.editor.IContentWidget) => {
      node.append(widget.getDomNode());
    },
    removeContentWidget: remove,
    layoutContentWidget: vi.fn(),
    onDidChangeModelContent: (callback: typeof change) => {
      change = callback;
      return { dispose: vi.fn() };
    },
    onDidChangeCursorPosition: (callback: () => void) => {
      cursorChange = callback;
      return { dispose: vi.fn() };
    },
    executeEdits: edits,
    pushUndoStop: vi.fn(),
    setPosition: vi.fn(),
    focus: vi.fn(),
  } as unknown as Monaco.editor.IStandaloneCodeEditor;
  return {
    editor,
    edits,
    node,
    remove,
    open: () => {
      act(() => {
        change({
          changes: [{ text: '@', rangeOffset: caret - 1, rangeLength: 0 }],
        } as Monaco.editor.IModelContentChangedEvent);
      });
    },
    setValue: (next: string) => {
      value = next;
      caret = next.length;
    },
    type: (text: string) => {
      const offset = caret;
      value = value.slice(0, caret) + text + value.slice(caret);
      caret += text.length;
      act(() => {
        change({
          changes: [{ text, rangeOffset: offset, rangeLength: 0 }],
        } as Monaco.editor.IModelContentChangedEvent);
      });
    },
    moveCaret: (offset: number) => {
      caret = offset;
      act(cursorChange);
    },
  };
}

describe('DataMartMentionPicker', () => {
  beforeEach(() => {
    loaders.marts.mockReset().mockResolvedValue([
      { id: 'orders', title: 'Store Orders', icon: 'purchases' },
      { id: 'users', title: 'Users' },
    ]);
    loaders.fields.mockReset().mockResolvedValue([
      { name: 'total', alias: 'Order total', calculated: false },
      { name: 'revenue_per_order', alias: 'Average [order]', calculated: true },
    ]);
  });

  it('searches marts, drills into fields, searches by alias and inserts a calculated field reference', async () => {
    const h = harness();
    const view = render(
      <DataMartMentionPicker editor={h.editor} projectId='project' disabled={false} />
    );
    h.open();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'orders' } });
    expect(await screen.findByText('Store Orders')).toBeInTheDocument();
    expect(screen.queryByText('Users')).not.toBeInTheDocument();
    expect(
      screen
        .getByText('Store Orders')
        .closest('[role=option]')
        ?.querySelector('.lucide-shopping-cart')
    ).not.toBeNull();
    fireEvent.click(screen.getByText('Store Orders'));
    expect(await screen.findByText('Order total')).toBeInTheDocument();
    expect(loaders.fields).toHaveBeenCalledWith('orders');
    fireEvent.change(screen.getByRole('combobox', { name: 'Search fields' }), {
      target: { value: 'average' },
    });
    expect(screen.queryByText('Order total')).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(h.edits).toHaveBeenCalledWith('description-mention', [
      {
        range: { startLineNumber: 1, startColumn: 5, endLineNumber: 1, endColumn: 6 },
        text: expect.stringMatching(
          /\[Store Orders · Average \\\[order\\\]\].*\?field=revenue_per_order/
        ),
        forceMoveMarkers: true,
      },
    ]);
    expect(screen.queryByTestId('data-mart-mention-picker')).not.toBeInTheDocument();
    view.unmount();
    expect(h.remove).toHaveBeenCalledOnce();
    h.node.remove();
  });

  it('allows an entire Data Mart reference and closes with Escape without canceling the editor', async () => {
    const h = harness();
    const view = render(
      <DataMartMentionPicker editor={h.editor} projectId='project' disabled={false} />
    );
    h.open();
    fireEvent.click(await screen.findByText('Store Orders'));
    await screen.findByText('Order total');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'unknown' } });
    expect(screen.getByText('No matching fields.')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(screen.getByRole('combobox', { name: 'Search Data Marts' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Store Orders'));
    fireEvent.click(screen.getByText('Link entire Data Mart'));
    expect(h.edits.mock.calls[0][1][0].text).toMatch(/\[Store Orders\]\([^?]+\/data-setup\)/);
    h.setValue('@');
    h.open();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(screen.queryByTestId('data-mart-mention-picker')).not.toBeInTheDocument();
    view.unmount();
    h.node.remove();
  });

  it('uses Escape to go back and dismiss the picker before allowing the Context sheet to close', async () => {
    const h = harness('Unsaved context @');
    h.node.className = 'monaco-editor';
    const input = document.createElement('textarea');
    input.value = 'Unsaved context @';
    h.node.append(input);
    vi.mocked(h.editor.focus).mockImplementation(() => {
      input.focus();
    });
    const onOpenChange = vi.fn();
    const view = render(
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent onEscapeKeyDown={preventSheetDismissWhileSuggesting}>
          <SheetTitle>Configure context</SheetTitle>
          <SheetDescription>Business context</SheetDescription>
          <div
            ref={host => {
              host?.append(h.node);
            }}
          />
          <DataMartMentionPicker editor={h.editor} projectId='project' disabled={false} />
        </SheetContent>
      </Sheet>
    );
    h.open();
    fireEvent.click(await screen.findByText('Store Orders'));
    await screen.findByText('Order total');

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search fields' }), {
      key: 'Escape',
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Search Data Marts' })).toBeInTheDocument();
    expect(input.value).toBe('Unsaved context @');

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search Data Marts' }), {
      key: 'Escape',
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId('data-mart-mention-picker')).not.toBeInTheDocument();
    expect(input.value).toBe('Unsaved context @');
    expect(input).toHaveFocus();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    view.unmount();
    h.node.remove();
  });

  it('ignores late field results when switching marts and refuses to replace changed text', async () => {
    let resolve!: (fields: { name: string; alias: string; calculated: boolean }[]) => void;
    loaders.fields.mockImplementationOnce(
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    const h = harness('@');
    const view = render(
      <DataMartMentionPicker editor={h.editor} projectId='project' disabled={false} />
    );
    h.open();
    fireEvent.click(await screen.findByText('Store Orders'));
    fireEvent.click(screen.getByRole('button', { name: 'Back to Data Marts' }));
    fireEvent.click(screen.getByText('Users'));
    await screen.findByText('Order total');
    await act(async () => {
      resolve([{ name: 'old', alias: 'Obsolete', calculated: false }]);
    });
    expect(screen.queryByText('Obsolete')).not.toBeInTheDocument();
    h.setValue('Replaced text');
    fireEvent.click(screen.getByText('Link entire Data Mart'));
    expect(h.edits).not.toHaveBeenCalled();
    view.unmount();
    h.node.remove();
  });

  it('reports errors, ignores code mentions and closes when disabled while loading', async () => {
    const h = harness('` @');
    const view = render(
      <DataMartMentionPicker editor={h.editor} projectId='project' disabled={false} />
    );
    h.open();
    expect(loaders.marts).not.toHaveBeenCalled();
    h.setValue('@');
    loaders.marts.mockRejectedValueOnce(new Error('offline'));
    h.open();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load Data Marts');
    view.rerender(<DataMartMentionPicker editor={h.editor} projectId='project' disabled />);
    await waitFor(() => {
      expect(screen.queryByTestId('data-mart-mention-picker')).not.toBeInTheDocument();
    });
    view.unmount();
    h.node.remove();
  });

  it('keeps literal @ text editable after Escape and never opens from existing text or caret motion', async () => {
    const h = harness('Price @');
    const view = render(
      <DataMartMentionPicker editor={h.editor} projectId='project' disabled={false} />
    );
    h.open();
    await screen.findByText('Store Orders');
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    h.type(' list rate');
    for (let offset = 6; offset <= 17; offset++) h.moveCaret(offset);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(loaders.marts).toHaveBeenCalledOnce();
    h.setValue('Owner: @ops team');
    h.moveCaret(15);
    h.type(' tomorrow');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    h.type(' @'); // Pasting text containing @ does not open a picker.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    h.type(' ');
    h.type('@'); // A fresh trigger still works after dismissal.
    await screen.findByRole('combobox');
    expect(loaders.marts).toHaveBeenCalledTimes(2);
    view.unmount();
    h.node.remove();
  });

  it('closes when Tab leaves the picker without taking focus back from the next control', async () => {
    const h = harness();
    const view = render(
      <>
        <DataMartMentionPicker editor={h.editor} projectId='project' disabled={false} />
        <button>Next control</button>
      </>
    );
    h.open();
    const input = await screen.findByRole('combobox');
    const next = screen.getByRole('button', { name: 'Next control' });
    fireEvent.blur(input, { relatedTarget: next });
    next.focus();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(next).toHaveFocus();
    expect(h.editor.focus).not.toHaveBeenCalled();
    view.unmount();
    h.node.remove();
  });

  it('leaves wheel and touch scrolling to the list without reaching Monaco or blocking native scrolling', async () => {
    const h = harness();
    const consumeScroll = vi.fn((event: Event) => {
      event.preventDefault();
    });
    h.node.addEventListener('wheel', consumeScroll);
    h.node.addEventListener('touchmove', consumeScroll);
    const view = render(
      <DataMartMentionPicker editor={h.editor} projectId='project' disabled={false} />
    );
    h.open();
    await screen.findByText('Store Orders');
    const list = screen.getByRole('listbox');
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 200 });
    const touch = new Event('touchmove', { bubbles: true, cancelable: true });
    fireEvent(list, wheel);
    fireEvent(list, touch);
    expect(consumeScroll).not.toHaveBeenCalled();
    expect(wheel.defaultPrevented).toBe(false);
    expect(touch.defaultPrevented).toBe(false);
    // Scrolling elsewhere in the editor still reaches its own handler.
    fireEvent(h.node, new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 200 }));
    expect(consumeScroll).toHaveBeenCalledOnce();
    view.unmount();
    h.node.remove();
  });
});

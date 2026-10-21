import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { describe, expect, it, vi } from 'vitest';
import { Sheet, SheetContent, SheetTitle } from '@owox/ui/components/sheet';
import { ExpandableEditor } from './ExpandableEditor';
import { preventSheetDismissWhileSuggesting } from '../DescriptionEditor/description-editor-escape';

describe('ExpandableEditor', () => {
  it('keeps the same input, draft and selection when expanding, and Escape only collapses the editor', async () => {
    const mounted = vi.fn();
    const onSheetChange = vi.fn();
    const cancelEditor = vi.fn();
    function Editor() {
      useEffect(mounted, []);
      return (
        <textarea
          className='inputarea'
          aria-label='Description'
          defaultValue='Business goals'
          onKeyDown={event => {
            if (event.key === 'Escape') cancelEditor();
          }}
        />
      );
    }
    function Harness() {
      const [expanded, setExpanded] = useState(false);
      return (
        <Sheet open onOpenChange={onSheetChange}>
          <SheetContent aria-describedby={undefined}>
            <SheetTitle>Configure context</SheetTitle>
            <ExpandableEditor
              expanded={expanded}
              onExpandedChange={setExpanded}
              title='Description editor'
            >
              <button
                type='button'
                onClick={() => {
                  setExpanded(!expanded);
                }}
              >
                Toggle full screen
              </button>
              <Editor />
            </ExpandableEditor>
          </SheetContent>
        </Sheet>
      );
    }
    render(<Harness />);
    const input = screen.getByRole<HTMLTextAreaElement>('textbox');
    fireEvent.change(input, { target: { value: 'Unsaved draft' } });
    input.setSelectionRange(2, 6);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle full screen' }));
    await screen.findByRole('dialog', { name: 'Description editor' });
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('Unsaved draft');
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 6]);
    fireEvent.pointerDown(input);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.getByRole('dialog', { name: 'Description editor' })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Description editor' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('dialog', { name: 'Configure context' })).toBeInTheDocument();
    expect(onSheetChange).not.toHaveBeenCalled();
    expect(cancelEditor).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('Unsaved draft');
    expect(mounted).toHaveBeenCalledOnce();
  });

  it('lets the mention picker handle Escape before collapsing full screen', async () => {
    const onExpandedChange = vi.fn();
    render(
      <ExpandableEditor
        expanded
        onExpandedChange={onExpandedChange}
        title='Description editor'
        onEscapeKeyDown={preventSheetDismissWhileSuggesting}
      >
        <div data-description-mention-picker>
          <input aria-label='Find a Data Mart' />
        </div>
      </ExpandableEditor>
    );
    const input = await screen.findByRole('textbox', { name: 'Find a Data Mart' });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onExpandedChange).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onExpandedChange).toHaveBeenCalledWith(false);
  });

  it('keeps full screen open when a menu replaces the pointer target during selection', async () => {
    const onExpandedChange = vi.fn();
    function Menu() {
      const [selected, setSelected] = useState(false);
      return (
        <div
          onPointerDown={() => {
            flushSync(() => {
              setSelected(true);
            });
          }}
        >
          {selected ? (
            <span key='fields'>Output fields</span>
          ) : (
            <span key='dataset'>Sales Revenue</span>
          )}
        </div>
      );
    }
    render(
      <ExpandableEditor expanded onExpandedChange={onExpandedChange} title='Description editor'>
        <Menu />
      </ExpandableEditor>
    );
    const target = await screen.findByText('Sales Revenue');
    fireEvent.pointerDown(target);
    await screen.findByText('Output fields');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(target.isConnected).toBe(false);
    expect(onExpandedChange).not.toHaveBeenCalled();
  });

  it('preserves full screen while interacting with an opted-in toolbar portal', async () => {
    const onExpandedChange = vi.fn();
    function PortalMenu() {
      const [selected, setSelected] = useState(false);
      return createPortal(
        <div
          data-ignore-outside-dismiss
          onPointerDown={() => {
            flushSync(() => {
              setSelected(true);
            });
          }}
        >
          {selected ? (
            <span key='selected'>Formatted heading</span>
          ) : (
            <span key='option'>Heading option</span>
          )}
        </div>,
        document.body
      );
    }
    render(
      <ExpandableEditor expanded onExpandedChange={onExpandedChange} title='Description editor'>
        <PortalMenu />
      </ExpandableEditor>
    );
    const target = await screen.findByText('Heading option');
    fireEvent.pointerDown(target);
    await screen.findByText('Formatted heading');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(onExpandedChange).not.toHaveBeenCalled();
    expect(target.isConnected).toBe(false);
  });
});

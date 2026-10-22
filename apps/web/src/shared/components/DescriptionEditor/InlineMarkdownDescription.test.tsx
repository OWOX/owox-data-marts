import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { MarkdownEditorProps } from '../MarkdownEditor/MarkdownEditor';
import { InlineMarkdownDescription } from './InlineMarkdownDescription';

vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
vi.mock('./DataMartMentionPicker', () => ({ DataMartMentionPicker: () => null }));
vi.mock('./useDescriptionPreview', () => ({
  useDescriptionPreview: () => ({ html: '', loading: true, error: null }),
}));
vi.mock('../MarkdownEditor', () => ({
  MarkdownEditorPreview: () => <div>preview</div>,
  MarkdownEditor: function MockMarkdownEditor({
    onMount,
    options,
    value,
    onChange,
  }: MarkdownEditorProps) {
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
      let dispose = () => {};
      let blur = () => {};
      const commands = new Map<number, () => void>();
      const editor = {
        getDomNode: () => root.current,
        focus: () => root.current?.querySelector('textarea')?.focus(),
        getModel: () => null,
        onDidDispose: (callback: () => void) => {
          dispose = callback;
        },
        onDidBlurEditorText: (callback: () => void) => {
          blur = callback;
        },
        addCommand: (key: number, callback: () => void) => commands.set(key, callback),
      };
      const textarea = root.current!.querySelector('textarea')!;
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) commands.get(3)?.();
      };
      const onBlur = () => {
        blur();
      };
      textarea.addEventListener('keydown', onKeyDown);
      textarea.addEventListener('blur', onBlur);
      onMount?.(
        editor as never,
        { KeyMod: { CtrlCmd: 1 }, KeyCode: { Enter: 2, Escape: 9 } } as never
      );
      return () => {
        textarea.removeEventListener('keydown', onKeyDown);
        textarea.removeEventListener('blur', onBlur);
        dispose();
      };
    }, [onMount]);
    return (
      <div ref={root}>
        <textarea
          className='inputarea'
          aria-label={options?.ariaLabel}
          readOnly={options?.readOnly}
          value={value}
          onChange={event => {
            onChange(event.target.value);
          }}
        />
      </div>
    );
  },
}));

describe('InlineMarkdownDescription', () => {
  it('shows a failed save inside full screen, preserves the draft and allows retry', async () => {
    const onUpdate = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    const draft = '[Revenue](https://app.example/ui/project/data-marts/id?field=revenue)';
    render(
      <InlineMarkdownDescription
        projectId='project'
        currentDataMartId='data-mart'
        description='Original'
        onUpdate={onUpdate}
        aiButton={<button type='button'>AI helper</button>}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit description' }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: draft } });
    fireEvent.click(screen.getByRole('button', { name: 'Expand description editor' }));
    const dialog = await screen.findByRole('dialog', { name: 'Description editor' });
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'AI helper' })).toBeVisible();
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true });
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(
      'Could not save description. Your changes are still in the editor.'
    );
    expect(alert.closest('[aria-hidden="true"]')).toBeNull();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(within(dialog).getByRole('textbox')).toBe(input);
    expect(input).toHaveValue(draft);
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith(draft);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Exit full screen' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('alert')).toBe(alert);
    expect(alert.closest('[aria-hidden="true"]')).toBeNull();
    expect(input).toHaveValue(draft);

    fireEvent.click(screen.getByRole('button', { name: 'Expand description editor' }));
    await screen.findByRole('dialog', { name: 'Description editor' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenLastCalledWith(draft);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit description' })).toHaveFocus();
    });
  });

  it('cancels a full-screen draft without saving and returns focus to the pencil', async () => {
    const onUpdate = vi.fn();
    render(
      <InlineMarkdownDescription projectId='project' description='Original' onUpdate={onUpdate} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit description' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Unsaved' } });
    fireEvent.click(screen.getByRole('button', { name: 'Expand description editor' }));
    const dialog = await screen.findByRole('dialog', { name: 'Description editor' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(onUpdate).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit description' })).toHaveFocus();
    });
  });

  it('saves Markdown unchanged and keeps unsaved text on failure for retry', async () => {
    const onUpdate = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    render(
      <InlineMarkdownDescription projectId='project' description='Original' onUpdate={onUpdate} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit description' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '[MQL](https://app.example/ui/project/data-marts/id/data-setup)' },
    });
    fireEvent.blur(screen.getByRole('textbox'));
    expect(onUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('textbox')).toHaveValue(
      '[MQL](https://app.example/ui/project/data-marts/id/data-setup)'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });
    expect(onUpdate).toHaveBeenLastCalledWith(
      '[MQL](https://app.example/ui/project/data-marts/id/data-setup)'
    );
  });
  it('clears empty descriptions to null, cancels without writes and preserves read-only mode', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const view = render(
      <InlineMarkdownDescription projectId='project' description='Original' onUpdate={onUpdate} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit description' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit description' }));
    expect(screen.getByRole('textbox')).toHaveValue('Original');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(null);
    });
    view.rerender(
      <InlineMarkdownDescription
        projectId='project'
        description='Original'
        onUpdate={onUpdate}
        readOnly
      />
    );
    expect(screen.queryByRole('button', { name: 'Edit description' })).not.toBeInTheDocument();
  });
});

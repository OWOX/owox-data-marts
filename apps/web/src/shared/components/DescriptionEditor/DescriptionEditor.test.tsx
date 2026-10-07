import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import type { MarkdownEditorProps } from '../MarkdownEditor/MarkdownEditor';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@owox/ui/components/form';
import { DescriptionEditor } from './DescriptionEditor';

vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
vi.mock('./useDataMartReferences', () => ({ useDataMartReferences: () => vi.fn() }));
vi.mock('./data-mart-mentions', () => ({
  registerDataMartMentions: () => ({ dispose: vi.fn() }),
}));
vi.mock('../MarkdownEditor', () => ({
  useMarkdownPreview: () => ({ html: '', loading: false, error: null }),
  MarkdownEditorPreview: () => <div>Preview content</div>,
  MarkdownEditorTabs: ({ onChange }: { onChange: (tab: 'markdown' | 'preview') => void }) => (
    <>
      <button
        type='button'
        onClick={() => {
          onChange('markdown');
        }}
      >
        Markdown
      </button>
      <button
        type='button'
        onClick={() => {
          onChange('preview');
        }}
      >
        Preview
      </button>
    </>
  ),
  MarkdownEditor: function MockMarkdownEditor({ onMount, options }: MarkdownEditorProps) {
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
      let dispose = () => {};
      let blur = () => {};
      const editor = {
        getDomNode: () => root.current,
        onDidDispose: (callback: () => void) => {
          dispose = callback;
        },
        onDidBlurEditorText: (callback: () => void) => {
          blur = callback;
        },
        addCommand: vi.fn(),
      };
      const textarea = root.current!.querySelector('textarea')!;
      textarea.addEventListener('blur', () => {
        blur();
      });
      onMount?.(
        editor as never,
        { KeyMod: { CtrlCmd: 1 }, KeyCode: { Enter: 2, Escape: 3 } } as never
      );
      return () => {
        dispose();
      };
    }, [onMount]);
    return (
      <div ref={root}>
        <textarea className='inputarea' aria-label={options?.ariaLabel} />
      </div>
    );
  },
}));

function ContextDescriptionField() {
  const form = useForm({ defaultValues: { description: '' } });
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name='description'
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description (optional)</FormLabel>
            <FormControl>
              <DescriptionEditor projectId='project' {...field} />
            </FormControl>
            <FormDescription>Context help</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <button
        type='button'
        onClick={() => {
          form.setFocus('description');
        }}
      >
        Focus field
      </button>
      <button
        type='button'
        onClick={() => {
          form.setError('description', { message: 'Invalid description' });
        }}
      >
        Show error
      </button>
      <output>{String(form.formState.touchedFields.description ?? false)}</output>
    </Form>
  );
}

describe('DescriptionEditor form integration', () => {
  it('connects the label, help, errors, focus ref and blur to the Monaco input across preview switches', async () => {
    render(<ContextDescriptionField />);
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Slash commands' })).not.toBeInTheDocument();
    const input = screen.getByRole('textbox');
    const label = screen.getByText('Description (optional)').closest('label')!;
    expect(label.control).toBe(input);
    expect(input).toHaveAttribute('name', 'description');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(document.getElementById(input.getAttribute('aria-describedby')!)).toHaveTextContent(
      'Context help'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Focus field' }));
    await waitFor(() => {
      expect(input).toHaveFocus();
    });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(screen.getByText('true')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show error' }));
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(
      input
        .getAttribute('aria-describedby')!
        .split(' ')
        .map(id => document.getElementById(id)?.textContent)
    ).toEqual(['Context help', 'Invalid description']);
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bold' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
    const reopened = screen.getByRole('textbox');
    expect(label.control).toBe(reopened);
    expect(reopened).toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Focus field' }));
    await waitFor(() => {
      expect(reopened).toHaveFocus();
    });
  });
});

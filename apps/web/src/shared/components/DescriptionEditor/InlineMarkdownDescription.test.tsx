import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InlineMarkdownDescription } from './InlineMarkdownDescription';

vi.mock('./DescriptionEditor', () => ({
  DescriptionEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label='Description'
      value={value}
      onChange={event => {
        onChange(event.target.value);
      }}
    />
  ),
}));
vi.mock('../MarkdownEditor', () => ({
  useMarkdownPreview: () => ({ html: '', loading: true, error: null }),
  MarkdownEditorPreview: () => <div>preview</div>,
}));

describe('InlineMarkdownDescription', () => {
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

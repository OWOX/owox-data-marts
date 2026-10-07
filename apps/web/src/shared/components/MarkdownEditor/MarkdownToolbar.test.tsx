import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownToolbar } from './MarkdownToolbar';

describe('MarkdownToolbar', () => {
  it('formats without submitting the containing form and has no template commands', () => {
    const onSubmit = vi.fn(event => event.preventDefault());
    const onActionClick = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <MarkdownToolbar onActionClick={onActionClick} onHeadingClick={vi.fn()} />
      </form>
    );
    expect(screen.queryByRole('button', { name: 'Slash commands' })).not.toBeInTheDocument();
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('type', 'button');
    }
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(onActionClick.mock.calls).toEqual([['bold'], ['table']]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables all formatting actions when the editor is read only', () => {
    const onActionClick = vi.fn();
    render(<MarkdownToolbar readOnly onActionClick={onActionClick} onHeadingClick={vi.fn()} />);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(onActionClick).not.toHaveBeenCalled();
  });

  it('lets the consumer supply its own commands and collapses them with formatting', () => {
    render(
      <MarkdownToolbar collapsible onActionClick={vi.fn()} onHeadingClick={vi.fn()}>
        <button type='button'>Template command</button>
      </MarkdownToolbar>
    );
    expect(screen.getByRole('button', { name: 'Template command' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse toolbar' }));
    expect(screen.queryByRole('button', { name: 'Template command' })).not.toBeInTheDocument();
    expect(screen.getByText('Markdown')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand toolbar' }));
    expect(screen.getByRole('button', { name: 'Template command' })).toBeInTheDocument();
  });
});

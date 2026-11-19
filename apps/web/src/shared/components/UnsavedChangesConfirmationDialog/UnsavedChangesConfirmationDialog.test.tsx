// @vitest-environment happy-dom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { UnsavedChangesConfirmationDialog } from './UnsavedChangesConfirmationDialog';

describe('UnsavedChangesConfirmationDialog', () => {
  it('renders the standard unsaved-changes copy and buttons', () => {
    render(<UnsavedChangesConfirmationDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();
    expect(screen.getByText('You have unsaved changes. Exit without saving?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, leave now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No, stay here' })).toBeInTheDocument();
  });

  it('calls onConfirm when the user confirms leaving', () => {
    const onConfirm = vi.fn();
    render(<UnsavedChangesConfirmationDialog open onOpenChange={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yes, leave now' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows a custom description', () => {
    render(
      <UnsavedChangesConfirmationDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        description='Setup choices are not saved.'
      />
    );
    expect(screen.getByText('Setup choices are not saved.')).toBeInTheDocument();
    expect(
      screen.queryByText('You have unsaved changes. Exit without saving?')
    ).not.toBeInTheDocument();
  });

  it('wraps a custom description so it can break', () => {
    render(
      <UnsavedChangesConfirmationDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        description='Setup choices are not saved.'
      />
    );
    expect(screen.getByText('Setup choices are not saved.')).toHaveClass(
      '[overflow-wrap:anywhere]'
    );
  });
});

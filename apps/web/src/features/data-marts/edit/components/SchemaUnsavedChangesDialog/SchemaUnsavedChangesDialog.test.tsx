// @vitest-environment happy-dom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SchemaUnsavedChangesDialog } from './SchemaUnsavedChangesDialog';

describe('SchemaUnsavedChangesDialog', () => {
  const baseProps = {
    open: true,
    onSaveAndContinue: vi.fn(),
    onDiscardAndContinue: vi.fn(),
    onCancel: vi.fn(),
  };

  it('shows continue-verb buttons for non-navigation intents', () => {
    render(<SchemaUnsavedChangesDialog {...baseProps} intent='refresh' />);
    expect(screen.getByRole('button', { name: /save & continue/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discard & continue/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('uses the "leave" verb for navigation intent', () => {
    render(<SchemaUnsavedChangesDialog {...baseProps} intent='navigation' />);
    expect(screen.getByRole('button', { name: /save & leave/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discard & leave/i })).toBeInTheDocument();
  });

  it('disables action buttons while saving', () => {
    render(<SchemaUnsavedChangesDialog {...baseProps} intent='refresh' isSaving={true} />);
    expect(screen.getByRole('button', { name: /save & continue/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /discard & continue/i })).toBeDisabled();
  });

  it('wires button clicks to the handlers', () => {
    const onSaveAndContinue = vi.fn();
    const onDiscardAndContinue = vi.fn();
    render(
      <SchemaUnsavedChangesDialog
        {...baseProps}
        intent='ai'
        onSaveAndContinue={onSaveAndContinue}
        onDiscardAndContinue={onDiscardAndContinue}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /save & continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /discard & continue/i }));
    expect(onSaveAndContinue).toHaveBeenCalledTimes(1);
    expect(onDiscardAndContinue).toHaveBeenCalledTimes(1);
    expect(baseProps.onCancel).not.toHaveBeenCalled();
  });

  it('cancels on Escape when not saving', () => {
    const onCancel = vi.fn();
    render(<SchemaUnsavedChangesDialog {...baseProps} intent='refresh' onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not cancel on Escape while saving', () => {
    const onCancel = vi.fn();
    render(
      <SchemaUnsavedChangesDialog
        {...baseProps}
        intent='refresh'
        isSaving={true}
        onCancel={onCancel}
      />
    );
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ReportFormMode } from '../../../shared';
import { ReportFormActions } from './ReportFormActions';

function renderActions(props: Partial<Parameters<typeof ReportFormActions>[0]> = {}) {
  return render(
    <ReportFormActions
      mode={ReportFormMode.CREATE}
      isSubmitting={false}
      isDirty={false}
      triggersDirty={false}
      runAfterSaveRef={{ current: false }}
      onSubmit={vi.fn()}
      {...props}
    />
  );
}

describe('ReportFormActions', () => {
  it('keeps the primary button clickable in CREATE mode so submit can surface validation errors', () => {
    renderActions({ mode: ReportFormMode.CREATE });

    expect(screen.getByRole('button', { name: 'Create & Run report' })).toBeEnabled();
  });

  it('disables the primary button while submitting', () => {
    renderActions({ mode: ReportFormMode.CREATE, isSubmitting: true });

    expect(screen.getByRole('button', { name: 'Create & Run report' })).toBeDisabled();
  });

  it('disables the primary button in EDIT mode when nothing changed', () => {
    renderActions({ mode: ReportFormMode.EDIT });

    expect(screen.getByRole('button', { name: 'Save changes to report' })).toBeDisabled();
  });

  it('enables the primary button in EDIT mode when the form is dirty', () => {
    renderActions({ mode: ReportFormMode.EDIT, isDirty: true });

    expect(screen.getByRole('button', { name: 'Save changes to report' })).toBeEnabled();
  });

  it('prevents double-submit via dropdown before isSubmitting prop updates', async () => {
    const onSubmit = vi.fn();
    renderActions({ mode: ReportFormMode.CREATE, onSubmit });

    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions' }));
    const item1 = await within(document.body).findByText('Create new report');
    fireEvent.click(item1);

    expect(onSubmit).toHaveBeenCalledTimes(1);

    // isSubmitting prop is still false — simulate the race window
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions' }));
    await waitFor(() => within(document.body).findByText('Create new report'));
    const item2 = within(document.body).getByText('Create new report');
    fireEvent.click(item2);

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

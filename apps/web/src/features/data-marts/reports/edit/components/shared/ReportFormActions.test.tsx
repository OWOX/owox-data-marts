import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});

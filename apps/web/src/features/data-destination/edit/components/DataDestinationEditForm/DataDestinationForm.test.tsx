// @vitest-environment happy-dom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useContext } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { DataDestinationType, type DataDestinationFormData } from '../../../shared';
import { CopyCredentialContext } from '../../model/context/copy-credential-context';
import { DataDestinationForm } from './DataDestinationForm';

vi.mock('../../../../idp/hooks/useAuthState', () => ({ useUser: () => null }));
vi.mock('../../../../idp/hooks/useRole', () => ({ useIsAdmin: () => false }));
vi.mock('../../../../../features/contexts/hooks/useInlineContextCreate', () => ({
  useInlineContextCreate: () => ({ pickerProps: {}, sheetProps: {} }),
}));
vi.mock('../../../../../features/contexts/components/ContextPicker/ContextPicker', () => ({
  ContextPicker: () => null,
}));
vi.mock('../../../../../features/contexts/components/AddContextSheet/AddContextSheet', () => ({
  AddContextSheet: () => null,
}));
vi.mock('../../../../../shared/components/OwnersSection/OwnersSection', () => ({
  OwnersSection: () => null,
}));

// The copy-source picker is buried in the Google Sheets credential fields; a stub that only
// exposes the context call keeps the test about the form, not the OAuth UI.
vi.mock('./GoogleSheetsFields', () => ({
  GoogleSheetsFields: () => {
    const ctx = useContext(CopyCredentialContext);
    return (
      <button type='button' onClick={() => ctx?.onSourceSelect('src-1', 'Source', null)}>
        Pick source
      </button>
    );
  },
}));

// Excel has no type-specific fields, so switching to it leaves only the shared ones to submit.
vi.mock('./DestinationTypeField', () => ({
  DestinationTypeField: ({ form }: { form: UseFormReturn<DataDestinationFormData> }) => (
    <button
      type='button'
      onClick={() => {
        form.setValue('type', DataDestinationType.EXCEL);
      }}
    >
      Switch to Excel
    </button>
  ),
}));

function renderForm() {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<DataDestinationForm initialData={null} onSubmit={onSubmit} onCancel={vi.fn()} />);
  return onSubmit;
}

describe('DataDestinationForm', () => {
  it('submits the picked copy source while the type still supports it', async () => {
    const onSubmit = renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Pick source' }));
    fireEvent.submit(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0][1]).toMatchObject({ id: 'src-1' });
  });

  it('drops the picked copy source once the destination type changes', async () => {
    // The clear button lives inside the Google Sheets fields, so after the switch nothing
    // else could undo the selection — and every other type rejects sourceDestinationId.
    const onSubmit = renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Pick source' }));
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Excel' }));
    fireEvent.submit(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    const [data, source] = onSubmit.mock.calls[0] as [DataDestinationFormData, unknown];
    expect(source).toBeNull();
    expect(data.type).toBe(DataDestinationType.EXCEL);
    expect(data).not.toHaveProperty('credentials');
  });
});

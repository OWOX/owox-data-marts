import { zodResolver } from '@hookform/resolvers/zod';
import { fireEvent, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { Form } from '@owox/ui/components/form';
import {
  DataDestinationType,
  dataDestinationSchema,
  type DataDestinationFormData,
} from '../../../shared';
import { CopyCredentialContext } from '../../model/context/copy-credential-context';
import { GoogleSheetsFields } from './GoogleSheetsFields';

vi.mock('../../../../google-oauth', () => ({
  GoogleOAuthConnectButton: () => <button type='button'>Connect with Google</button>,
  destinationOAuthApi: {
    getSettings: vi.fn().mockResolvedValue({ available: true, redirectUri: undefined }),
    getCredentialStatus: vi.fn().mockResolvedValue({ isValid: false }),
  },
}));

vi.mock('../CopyDestinationCredentialsButton', () => ({
  CopyDestinationCredentialsButton: () => null,
}));

function TestForm({ onValid }: { onValid: (data: DataDestinationFormData) => void }) {
  const form = useForm<DataDestinationFormData>({
    resolver: zodResolver(dataDestinationSchema),
    defaultValues: { title: 'New Destination', type: DataDestinationType.GOOGLE_SHEETS },
    mode: 'onTouched',
  });

  return (
    <Form {...form}>
      <form onSubmit={e => void form.handleSubmit(onValid)(e)}>
        <CopyCredentialContext.Provider
          value={{
            entityId: undefined,
            onSourceSelect: vi.fn(),
            selectedSource: null,
            onSourceClear: vi.fn(),
          }}
        >
          <GoogleSheetsFields form={form} />
        </CopyCredentialContext.Provider>
        <button type='submit'>Save</button>
      </form>
    </Form>
  );
}

describe('GoogleSheetsFields', () => {
  it('shows a validation error in OAuth mode when saving without a Google connection', async () => {
    const onValid = vi.fn();
    render(<TestForm onValid={onValid} />);

    // OAuth settings load async; the OAuth tab is the default once available
    expect(await screen.findByRole('button', { name: 'Connect with Google' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Connect your Google account or provide a Service Account to save')
    ).toBeInTheDocument();
    expect(onValid).not.toHaveBeenCalled();
  });
});
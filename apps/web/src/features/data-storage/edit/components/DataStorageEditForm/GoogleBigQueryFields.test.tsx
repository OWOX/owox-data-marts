import { zodResolver } from '@hookform/resolvers/zod';
import { fireEvent, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { Form } from '@owox/ui/components/form';
import { DataStorageType, googleBigQuerySchema, type GoogleBigQueryFormData } from '../../../shared';
import { CopyCredentialContext } from '../../model/context/copy-credential-context';
import { GoogleBigQueryFields } from './GoogleBigQueryFields';

vi.mock('../../../../../features/google-oauth', () => ({
  GoogleOAuthConnectButton: () => <button type='button'>Connect with Google</button>,
  storageOAuthApi: {
    getSettings: vi.fn().mockResolvedValue({ available: true, redirectUri: undefined }),
  },
}));

vi.mock('../CopyStorageCredentialsButton', () => ({
  CopyStorageCredentialsButton: () => null,
}));

function TestForm({ onValid }: { onValid: (data: GoogleBigQueryFormData) => void }) {
  const form = useForm<GoogleBigQueryFormData>({
    resolver: zodResolver(googleBigQuerySchema),
    defaultValues: {
      title: 'New Storage',
      type: DataStorageType.GOOGLE_BIGQUERY,
      config: { projectId: 'my-project', location: 'US' },
    },
    mode: 'onTouched',
  });

  return (
    <Form {...form}>
      <form onSubmit={e => void form.handleSubmit(onValid)(e)}>
        <CopyCredentialContext.Provider
          value={{
            entityId: 'storage-1',
            onSourceSelect: vi.fn(),
            selectedSource: null,
            onSourceClear: vi.fn(),
          }}
        >
          <GoogleBigQueryFields form={form} />
        </CopyCredentialContext.Provider>
        <button type='submit'>Save</button>
      </form>
    </Form>
  );
}

describe('GoogleBigQueryFields', () => {
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
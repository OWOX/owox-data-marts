import { zodResolver } from '@hookform/resolvers/zod';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { Form } from '@owox/ui/components/form';
import {
  DataStorageType,
  googleBigQuerySchema,
  type GoogleBigQueryFormData,
} from '../../../shared';
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

function TestForm({
  onValid,
  projectId = 'my-project',
  credentialId,
}: {
  onValid: (data: GoogleBigQueryFormData) => void;
  projectId?: string;
  credentialId?: string;
}) {
  const form = useForm<GoogleBigQueryFormData>({
    resolver: zodResolver(googleBigQuerySchema),
    defaultValues: {
      title: 'New Storage',
      type: DataStorageType.GOOGLE_BIGQUERY,
      config: { projectId, location: 'US' },
      ...(credentialId && { credentials: { credentialId } }),
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

  it('highlights a Project ID that is a project name before anything is sent', async () => {
    const onValid = vi.fn();
    render(
      <TestForm
        onValid={onValid}
        projectId='BASE DE LEADS SAFETY'
        credentialId='6f1c1b1e-8a43-4c5e-9a39-0d5b3c6f2a10'
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/Use the Project ID, not the project name/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter a Project Id')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(onValid).not.toHaveBeenCalled();
  });

  it('saves a pasted Project ID without the surrounding whitespace', async () => {
    const onValid = vi.fn();
    render(
      <TestForm
        onValid={onValid}
        projectId='  my-project-123 '
        credentialId='6f1c1b1e-8a43-4c5e-9a39-0d5b3c6f2a10'
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onValid).toHaveBeenCalled();
    });
    const [data] = onValid.mock.calls[0] as [GoogleBigQueryFormData];
    expect(data.config.projectId).toBe('my-project-123');
  });
});

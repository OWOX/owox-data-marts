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
import { GoogleBigQueryFields } from './GoogleBigQueryFields';

function TestForm({
  onValid,
  projectId = 'my-project',
}: {
  onValid: (data: GoogleBigQueryFormData) => void;
  projectId?: string;
}) {
  const form = useForm<GoogleBigQueryFormData>({
    resolver: zodResolver(googleBigQuerySchema),
    defaultValues: {
      title: 'New Storage',
      type: DataStorageType.GOOGLE_BIGQUERY,
      config: { projectId, location: 'US' },
      reusableCredentialId: '6f1c1b1e-8a43-4c5e-9a39-0d5b3c6f2a10',
    },
    mode: 'onTouched',
  });

  return (
    <Form {...form}>
      <form onSubmit={e => void form.handleSubmit(onValid)(e)}>
        <GoogleBigQueryFields form={form} />
        <button type='submit'>Save</button>
      </form>
    </Form>
  );
}

describe('GoogleBigQueryFields', () => {
  it('holds connection settings only: the Credential is chosen elsewhere', () => {
    render(<TestForm onValid={vi.fn()} />);

    expect(screen.queryByText(/Authentication method/i)).toBeNull();
    expect(screen.queryByText(/Service Account/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Connect with Google/ })).toBeNull();
    expect(screen.getByPlaceholderText('Enter a Project Id')).toBeInTheDocument();
  });

  it('highlights a Project ID that is a project name before anything is sent', async () => {
    const onValid = vi.fn();
    render(<TestForm onValid={onValid} projectId='BASE DE LEADS SAFETY' />);

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
    render(<TestForm onValid={onValid} projectId='  my-project-123 ' />);

    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onValid).toHaveBeenCalled();
    });
    const [data] = onValid.mock.calls[0] as [GoogleBigQueryFormData];
    expect(data.config.projectId).toBe('my-project-123');
  });
});

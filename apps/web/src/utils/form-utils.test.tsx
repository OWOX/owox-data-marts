import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSection,
} from '@owox/ui/components/form';
import { applyServerFieldErrors, focusFirstInvalidField } from './form-utils';
import { extractApiFieldErrors } from '../app/api/extract-api-error.util';

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
});

type TestFormData = z.infer<typeof schema>;

function TestForm() {
  const form = useForm<TestFormData>({
    resolver: zodResolver(schema),
    defaultValues: { title: '' },
  });

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={e => {
          void form.handleSubmit(() => {
            /* valid submit is a no-op */
          }, focusFirstInvalidField)(e);
        }}
      >
        <FormSection title='General'>
          <FormField
            control={form.control}
            name='title'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>
        <button type='submit'>Save</button>
      </form>
    </Form>
  );
}

describe('focusFirstInvalidField', () => {
  it('focuses the first element marked aria-invalid once the next frames are painted', async () => {
    render(
      <div>
        <input aria-label='Valid' />
        <input aria-label='Broken' aria-invalid='true' />
      </div>
    );

    focusFirstInvalidField();

    await waitFor(() => {
      expect(screen.getByLabelText('Broken')).toHaveFocus();
    });
  });

  it('focuses the first invalid element scoped inside the event target form if target is provided', async () => {
    render(
      <div>
        <form data-testid='first-form'>
          <input aria-label='Input in first form' aria-invalid='true' />
        </form>
        <form data-testid='second-form'>
          <input aria-label='Input in second form' aria-invalid='true' />
        </form>
      </div>
    );

    const secondForm = screen.getByTestId('second-form');
    focusFirstInvalidField({}, { target: secondForm });

    await waitFor(() => {
      expect(screen.getByLabelText('Input in second form')).toHaveFocus();
    });
    expect(screen.getByLabelText('Input in first form')).not.toHaveFocus();
  });

  it('focuses the first invalid field after a failed submit, once collapsed sections reopen', async () => {
    render(<TestForm />);

    // User collapses the section, so the invalid field is unmounted at submit time
    fireEvent.click(screen.getByRole('button', { name: /general/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('Title is required');

    await waitFor(() => {
      expect(screen.getByLabelText('Title')).toHaveFocus();
    });
  });
});

const serverSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  projectId: z.string(),
});

type ServerTestFormData = z.infer<typeof serverSchema>;

// The shape axios rejects with when the server names the values it refused.
const rejectedSave = (fieldErrors: unknown) => ({
  response: { status: 400, data: { message: 'Invalid config', errorDetails: { fieldErrors } } },
});

function ServerTestForm({ save }: { save: () => Promise<void> }) {
  const form = useForm<ServerTestFormData>({
    resolver: zodResolver(serverSchema),
    defaultValues: { title: 'Storage', projectId: 'BASE DE LEADS' },
  });

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={e => {
          void form.handleSubmit(async (_data, event) => {
            try {
              await save();
            } catch (error) {
              const highlighted = applyServerFieldErrors(
                form.setError,
                extractApiFieldErrors(error),
                field => (field === 'config.projectId' ? 'projectId' : null)
              );
              if (highlighted) focusFirstInvalidField(undefined, event);
            }
          }, focusFirstInvalidField)(e);
        }}
      >
        <FormSection title='Connection Settings' defaultOpen={false} fields={['projectId']}>
          <FormField
            control={form.control}
            name='projectId'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Project ID</FormLabel>
                <FormControl>
                  <input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>
        <button type='submit'>Save</button>
      </form>
    </Form>
  );
}

describe('applyServerFieldErrors', () => {
  it('joins the messages of every request value that lands on one input', () => {
    const setError = vi.fn();

    const applied = applyServerFieldErrors(
      setError,
      [
        { field: 'credentials.private_key', message: 'private_key is required' },
        { field: 'credentials.client_email', message: 'client_email must be a valid email' },
        { field: 'credentials.client_email', message: 'client_email must be a valid email' },
      ],
      () => 'serviceAccount'
    );

    expect(applied).toBe(true);
    expect(setError).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith('serviceAccount', {
      type: 'server',
      message: 'private_key is required; client_email must be a valid email',
    });
  });

  it('reports nothing to focus when no input holds a rejected value', () => {
    const setError = vi.fn();

    expect(
      applyServerFieldErrors(setError, [{ field: 'config', message: 'Required' }], () => null)
    ).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });

  it('marks, reveals and focuses the input the server rejected', async () => {
    const save = vi
      .fn()
      .mockRejectedValue(
        rejectedSave([{ field: 'config.projectId', message: 'Invalid GCP project ID' }])
      );
    render(<ServerTestForm save={save} />);

    // The section starts collapsed, as Connection Settings can be when the user saves.
    expect(screen.queryByLabelText('Project ID')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Invalid GCP project ID')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('Project ID')).toHaveFocus();
    });
    expect(screen.getByLabelText('Project ID')).toHaveAttribute('aria-invalid', 'true');
  });

  it('clears the server error once the user edits the field', async () => {
    const save = vi
      .fn()
      .mockRejectedValue(
        rejectedSave([{ field: 'config.projectId', message: 'Invalid GCP project ID' }])
      );
    render(<ServerTestForm save={save} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Invalid GCP project ID');

    fireEvent.change(screen.getByLabelText('Project ID'), { target: { value: 'my-project-123' } });

    await waitFor(() => {
      expect(screen.queryByText('Invalid GCP project ID')).toBeNull();
    });
  });

  it('leaves the form untouched when the rejection names no field', async () => {
    const save = vi.fn().mockRejectedValue(rejectedSave('not a list'));
    render(<ServerTestForm save={save} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(save).toHaveBeenCalled();
    });
    expect(screen.getByRole('button', { name: /connection settings/i })).not.toHaveTextContent(
      'This section contains validation errors'
    );
  });
});

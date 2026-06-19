import { describe, it, expect } from 'vitest';
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
import { focusFirstInvalidField } from './form-utils';

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

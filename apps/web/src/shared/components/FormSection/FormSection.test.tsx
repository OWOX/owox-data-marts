/**
 * Tests for the validation-aware FormSection from @owox/ui.
 * The ui package has no test runner, so the tests live here in apps/web,
 * which already depends on @owox/ui and has vitest configured.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
});

type TestFormData = z.infer<typeof schema>;

function TestForm({
  defaultOpen = true,
  sectionFields,
  sectionName,
}: {
  defaultOpen?: boolean;
  sectionFields?: string[];
  sectionName?: string;
}) {
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
          })(e);
        }}
      >
        <FormSection
          title='General'
          defaultOpen={defaultOpen}
          fields={sectionFields}
          name={sectionName}
        >
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

describe('FormSection validation awareness', () => {
  it('reopens a user-collapsed section and shows the message when submit fails validation inside it', async () => {
    render(<TestForm />);

    // Field is visible while the section is open
    expect(screen.getByLabelText('Title')).toBeInTheDocument();

    // User collapses the section — content unmounts
    fireEvent.click(screen.getByRole('button', { name: /general/i }));
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();

    // Submit with an empty required field
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    // The section must reopen and the validation message must be visible
    expect(await screen.findByText('Title is required')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
  });

  it('opens a section that starts collapsed when its declared fields have errors', async () => {
    render(<TestForm defaultOpen={false} sectionFields={['title']} />);

    // Starts collapsed — the field never mounted
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Title is required')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
  });

  it('shows an error indicator in the section header after a failed submit', async () => {
    render(<TestForm />);

    expect(screen.queryByTestId('form-section-error-indicator')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Title is required');

    expect(await screen.findByTestId('form-section-error-indicator')).toBeInTheDocument();
  });

  it('does not overwrite the persisted user preference when auto-opening', async () => {
    localStorage.removeItem('form-section-general');
    render(<TestForm sectionName='general' />);

    // User collapses the named section — preference is persisted
    fireEvent.click(screen.getByRole('button', { name: /general/i }));
    expect(localStorage.getItem('form-section-general')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Title is required');

    // Section auto-opened, but the stored preference must stay untouched
    expect(localStorage.getItem('form-section-general')).toBe('false');
    localStorage.removeItem('form-section-general');
  });

  it('lets the user re-collapse the section after an auto-open until the next submit', async () => {
    render(<TestForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Title is required');

    // User collapses the auto-opened section — it must stay collapsed
    fireEvent.click(screen.getByRole('button', { name: /general/i }));
    expect(screen.queryByText('Title is required')).not.toBeInTheDocument();

    // The next submit attempt reopens it again
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Title is required')).toBeInTheDocument();
  });

  it('renders without crashing outside a react-hook-form context', () => {
    render(
      <FormSection title='Standalone'>
        <div>Plain content</div>
      </FormSection>
    );

    expect(screen.getByText('Plain content')).toBeInTheDocument();
  });
});

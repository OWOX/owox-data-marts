import { zodResolver } from '@hookform/resolvers/zod';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { Form } from '@owox/ui/components/form';
import {
  DataDestinationType,
  dataDestinationSchema,
  type DataDestinationFormData,
} from '../../../shared';
import { GoogleChatFields } from './GoogleChatFields';

type GoogleChatFormData = Extract<
  DataDestinationFormData,
  { type: DataDestinationType.GOOGLE_CHAT }
>;

function TestForm({
  credentials,
  onValid,
}: {
  credentials: GoogleChatFormData['credentials'];
  onValid: (data: DataDestinationFormData) => void;
}) {
  const form = useForm<DataDestinationFormData>({
    resolver: zodResolver(dataDestinationSchema),
    defaultValues: {
      title: 'Google Chat',
      type: DataDestinationType.GOOGLE_CHAT,
      credentials,
    },
    mode: 'onTouched',
  });

  return (
    <Form {...form}>
      <form onSubmit={event => void form.handleSubmit(onValid)(event)}>
        <GoogleChatFields form={form} />
        <output data-testid='dirty'>{String(form.formState.isDirty)}</output>
        <button type='submit'>Save</button>
      </form>
    </Form>
  );
}

describe('GoogleChatFields', () => {
  it('keeps an existing channel-email destination in email mode', async () => {
    const onValid = vi.fn();
    render(
      <TestForm
        credentials={{ deliveryMethod: 'email', to: ['space@example.com'] }}
        onValid={onValid}
      />
    );

    expect(screen.getByRole('tab', { name: 'Channel Email' })).toHaveAttribute(
      'data-state',
      'active'
    );
    expect(screen.getByRole('textbox')).toHaveValue('space@example.com');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledTimes(1);
    });
    expect(onValid.mock.calls[0][0].credentials).toEqual({
      deliveryMethod: 'email',
      to: ['space@example.com'],
    });
  });

  it('defaults an empty Google Chat form to webhook mode without marking it dirty', async () => {
    const onValid = vi.fn();
    render(<TestForm credentials={{} as GoogleChatFormData['credentials']} onValid={onValid} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Google Chat API' })).toHaveAttribute(
        'data-state',
        'active'
      );
    });
    expect(screen.getByTestId('dirty')).toHaveTextContent('false');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Enter a valid Google Chat incoming webhook URL')
    ).toBeInTheDocument();
    expect(onValid).not.toHaveBeenCalled();
  });

  it('marks method changes dirty and preserves a configured hidden webhook', async () => {
    const onValid = vi.fn();
    render(
      <TestForm credentials={{ deliveryMethod: 'webhook', configured: true }} onValid={onValid} />
    );

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Channel Email' }), {
      button: 0,
      ctrlKey: false,
    });
    const emailField = await screen.findByRole('textbox');
    fireEvent.change(emailField, { target: { value: 'space@example.com' } });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Google Chat API' }), {
      button: 0,
      ctrlKey: false,
    });

    expect(screen.getByTestId('dirty')).toHaveTextContent('true');
    expect(
      screen.getByPlaceholderText('Webhook configured — paste a new URL to replace it')
    ).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledTimes(1);
    });
    expect(onValid.mock.calls[0][0].credentials).toEqual({
      deliveryMethod: 'webhook',
      configured: true,
    });
  });
});

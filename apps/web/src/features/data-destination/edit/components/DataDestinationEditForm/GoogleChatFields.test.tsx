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
  reusableCredentialId = '',
  onValid,
}: {
  credentials: GoogleChatFormData['credentials'];
  reusableCredentialId?: string;
  onValid: (data: DataDestinationFormData) => void;
}) {
  const form = useForm<DataDestinationFormData>({
    resolver: zodResolver(dataDestinationSchema),
    defaultValues: {
      title: 'Google Chat',
      type: DataDestinationType.GOOGLE_CHAT,
      credentials,
      reusableCredentialId,
    },
    mode: 'onTouched',
  });

  return (
    <Form {...form}>
      <form onSubmit={event => void form.handleSubmit(onValid)(event)}>
        <GoogleChatFields form={form} credentialField={<span>Credential field</span>} />
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
    expect(screen.getByText('How does Channel Email delivery work?')).toBeInTheDocument();
    expect(screen.queryByText('How does Incoming Webhook delivery work?')).not.toBeInTheDocument();
    expect(screen.getByText('How do I get a Google Chat space email address?')).toBeInTheDocument();
    expect(screen.queryByText('Credential field')).not.toBeInTheDocument();
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
      expect(screen.getByRole('tab', { name: 'Incoming Webhook' })).toHaveAttribute(
        'data-state',
        'active'
      );
    });
    expect(screen.getByText('How does Incoming Webhook delivery work?')).toBeInTheDocument();
    expect(screen.queryByText('How does Channel Email delivery work?')).not.toBeInTheDocument();
    expect(screen.getByText('Credential field')).toBeInTheDocument();
    expect(
      screen.queryByText('How do I get a Google Chat space email address?')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('dirty')).toHaveTextContent('false');
  });

  it('requires a Credential for webhook delivery only', () => {
    const chat = { title: 'Google Chat', type: DataDestinationType.GOOGLE_CHAT };

    const webhook = dataDestinationSchema.safeParse({
      ...chat,
      credentials: { deliveryMethod: 'webhook' },
    });
    expect(webhook.error?.issues).toEqual([
      expect.objectContaining({ path: ['reusableCredentialId'], message: 'Select a Credential' }),
    ]);
    expect(
      dataDestinationSchema.safeParse({
        ...chat,
        credentials: { deliveryMethod: 'email', to: ['space@example.com'] },
      }).success
    ).toBe(true);
  });

  it('marks method changes dirty and keeps webhook delivery free of recipients', async () => {
    const onValid = vi.fn();
    render(
      <TestForm
        credentials={{ deliveryMethod: 'webhook' }}
        reusableCredentialId='hook-1'
        onValid={onValid}
      />
    );

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Channel Email' }), {
      button: 0,
      ctrlKey: false,
    });
    const emailField = await screen.findByRole('textbox');
    fireEvent.change(emailField, { target: { value: 'space@example.com' } });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Incoming Webhook' }), {
      button: 0,
      ctrlKey: false,
    });

    expect(screen.getByTestId('dirty')).toHaveTextContent('true');
    expect(screen.getByText('Credential field')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledTimes(1);
    });
    expect(onValid.mock.calls[0][0]).toMatchObject({
      credentials: { deliveryMethod: 'webhook' },
      reusableCredentialId: 'hook-1',
    });
    expect(onValid.mock.calls[0][0].credentials).not.toHaveProperty('to');
  });
});

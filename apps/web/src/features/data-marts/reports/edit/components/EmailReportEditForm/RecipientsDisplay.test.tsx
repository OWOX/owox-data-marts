import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useForm } from 'react-hook-form';

import { Form } from '@owox/ui/components/form';
import { DataDestinationType } from '../../../../../data-destination';
import { RecipientsDisplay } from './RecipientsDisplay.tsx';

const baseDestination = {
  id: 'destination-1',
  title: 'Google Chat',
  type: DataDestinationType.GOOGLE_CHAT as const,
  projectId: 'project-1',
  createdAt: new Date('2026-07-17T12:00:00Z'),
  modifiedAt: new Date('2026-07-17T12:00:00Z'),
};

function TestForm({ children }: { children: React.ReactNode }) {
  const form = useForm();
  return <Form {...form}>{children}</Form>;
}

describe('RecipientsDisplay', () => {
  it('hides the recipients block for Google Chat webhook delivery', () => {
    render(
      <RecipientsDisplay
        destination={{
          ...baseDestination,
          credentials: { deliveryMethod: 'webhook', configured: true },
        }}
      />
    );

    expect(screen.queryByText('Recipients of this report')).not.toBeInTheDocument();
    expect(screen.queryByText('No recipients found')).not.toBeInTheDocument();
  });

  it('keeps showing recipients for Google Chat channel-email delivery', () => {
    render(
      <TestForm>
        <RecipientsDisplay
          destination={{
            ...baseDestination,
            credentials: { deliveryMethod: 'email', to: ['space@example.com'] },
          }}
        />
      </TestForm>
    );

    expect(screen.getByText('Recipients of this report')).toBeInTheDocument();
    expect(screen.getByText('space@example.com')).toBeInTheDocument();
  });
});

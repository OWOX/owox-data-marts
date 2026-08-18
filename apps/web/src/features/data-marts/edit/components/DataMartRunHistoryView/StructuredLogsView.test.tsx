// @vitest-environment happy-dom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StructuredLogsView } from './StructuredLogsView';
import { LogLevel } from './types';

describe('StructuredLogsView', () => {
  it('renders an HTTPS address in a log message as a safe external link', () => {
    render(
      <StructuredLogsView
        logs={[
          {
            id: 'log-1',
            timestamp: '2026-08-18 12:43:25',
            level: LogLevel.ERROR,
            message: 'Create a managed license key at https://app.owox.com to enable execution.',
          },
        ]}
      />
    );

    const link = screen.getByRole('link', { name: 'https://app.owox.com' });
    expect(link).toHaveAttribute('href', 'https://app.owox.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does not render other addresses as links', () => {
    render(
      <StructuredLogsView
        logs={[
          {
            id: 'log-1',
            timestamp: '2026-08-18 12:43:25',
            level: LogLevel.ERROR,
            message: 'See https://customer.example.com for details.',
          },
        ]}
      />
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(/https:\/\/customer\.example\.com/)).toBeInTheDocument();
  });
});

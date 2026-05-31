import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiKeysTable } from './ApiKeysTable';
import type { ProjectMemberApiKey } from '../../types';
import { formatDateOnly } from '../../../../utils';

const key: ProjectMemberApiKey = {
  apiKeyId: 'pmk_1234567890123456789012',
  name: 'Looker Studio connector',
  expiresAt: null,
  createdAt: '2026-05-30T18:00:00.000Z',
  lastAuthenticatedAt: null,
};

vi.mock('@owox/ui/components/common/relative-time', () => ({
  __esModule: true,
  default: ({ date }: { date: Date }) => <span>{date.toISOString()}</span>,
}));

vi.mock('@owox/ui/components/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div role='tooltip'>{children}</div>,
}));

function futureIso(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

describe('ApiKeysTable', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
    });
  });

  it('opens API key details when a row is clicked', () => {
    const onOpenDetails = vi.fn();

    render(
      <ApiKeysTable
        keys={[key]}
        onCreateKey={vi.fn()}
        onOpenDetails={onOpenDetails}
        onEditName={vi.fn()}
        onRevoke={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Looker Studio connector'));

    expect(onOpenDetails).toHaveBeenCalledWith(key);
  });

  it('does not open API key details when copying the API Key ID', async () => {
    const onOpenDetails = vi.fn();

    render(
      <ApiKeysTable
        keys={[key]}
        onCreateKey={vi.fn()}
        onOpenDetails={onOpenDetails}
        onEditName={vi.fn()}
        onRevoke={vi.fn()}
      />
    );

    const apiKeyCell = screen.getByText('pmk_1234567890123456789012').closest('div');
    expect(apiKeyCell).not.toBeNull();

    fireEvent.click(
      within(apiKeyCell as HTMLElement).getByRole('button', { name: 'Copy API Key ID' })
    );

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('pmk_1234567890123456789012');
    });
    expect(onOpenDetails).not.toHaveBeenCalled();
  });

  it('does not open API key details when clicking the actions icon', () => {
    const onOpenDetails = vi.fn();
    const { container } = render(
      <ApiKeysTable
        keys={[key]}
        onCreateKey={vi.fn()}
        onOpenDetails={onOpenDetails}
        onEditName={vi.fn()}
        onRevoke={vi.fn()}
      />
    );

    const actionsIcon = container.querySelector('button svg.lucide-ellipsis');
    expect(actionsIcon).not.toBeNull();

    fireEvent.click(actionsIcon as SVGElement);

    expect(onOpenDetails).not.toHaveBeenCalled();
  });

  it('explains expiration dates that expire soon', () => {
    const expiresAt = futureIso(2);

    render(
      <ApiKeysTable
        keys={[{ ...key, expiresAt }]}
        onCreateKey={vi.fn()}
        onOpenDetails={vi.fn()}
        onEditName={vi.fn()}
        onRevoke={vi.fn()}
      />
    );

    const expirationDate = screen.getByText(formatDateOnly(expiresAt, { timeZone: 'UTC' }));

    expect(expirationDate).toHaveClass('font-medium', 'text-amber-600');
    expect(screen.getByRole('tooltip')).toHaveTextContent('This API key expires within 30 days.');
  });
});

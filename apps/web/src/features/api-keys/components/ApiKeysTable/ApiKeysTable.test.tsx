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

function pastIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe('ApiKeysTable', () => {
  beforeEach(() => {
    localStorage.clear();
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

  it('makes expired API keys visually obvious', () => {
    const expiresAt = pastIso(2);

    const { container } = render(
      <ApiKeysTable
        keys={[{ ...key, expiresAt }]}
        onCreateKey={vi.fn()}
        onOpenDetails={vi.fn()}
        onEditName={vi.fn()}
        onRevoke={vi.fn()}
      />
    );

    const expirationDate = screen.getByText(formatDateOnly(expiresAt, { timeZone: 'UTC' }));

    expect(expirationDate).toHaveClass('font-medium', 'text-destructive');
    expect(screen.getByRole('tooltip')).toHaveTextContent('This API key has expired.');
    expect(container.querySelector('svg.lucide-circle-alert')).toBeNull();
  });

  it('sorts keys that never expire as the furthest expiration date', () => {
    const keys: ProjectMemberApiKey[] = [
      { ...key, apiKeyId: 'pmk_never_1', name: 'Never 1', expiresAt: null },
      {
        ...key,
        apiKeyId: 'pmk_future_later',
        name: 'Future later',
        expiresAt: '2026-08-06T23:59:59.999Z',
      },
      {
        ...key,
        apiKeyId: 'pmk_expired',
        name: 'Expired',
        expiresAt: '2026-05-29T23:59:59.999Z',
      },
      {
        ...key,
        apiKeyId: 'pmk_future_soon',
        name: 'Future soon',
        expiresAt: '2026-06-18T23:59:59.999Z',
      },
      { ...key, apiKeyId: 'pmk_never_2', name: 'Never 2', expiresAt: null },
    ];

    render(
      <ApiKeysTable
        keys={keys}
        onCreateKey={vi.fn()}
        onOpenDetails={vi.fn()}
        onEditName={vi.fn()}
        onRevoke={vi.fn()}
      />
    );

    const getRenderedNames = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map(row => within(row).getAllByRole('cell')[0].textContent);

    fireEvent.click(screen.getByRole('button', { name: /Expires - not sorted/i }));

    expect(getRenderedNames()).toEqual([
      'Expired',
      'Future soon',
      'Future later',
      'Never 1',
      'Never 2',
    ]);

    fireEvent.click(screen.getByRole('button', { name: /Expires - sorted ascending/i }));

    expect(getRenderedNames()).toEqual([
      'Never 1',
      'Never 2',
      'Future later',
      'Future soon',
      'Expired',
    ]);
  });
});

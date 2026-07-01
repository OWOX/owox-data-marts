import type { ReactNode } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SecretRevealDialog } from './SecretRevealDialog';
import type { CreateProjectMemberApiKeyResponse } from '../types';

vi.mock('@owox/ui/components/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div role='dialog'>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <div data-slot='dialog-footer'>{children}</div>
  ),
}));

vi.mock('@owox/ui/components/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div role='tooltip'>{children}</div>,
}));

vi.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: vi.fn(),
  },
}));

const createdKey: CreateProjectMemberApiKeyResponse = {
  apiKeyId: 'pmk_1234567890123456789012',
  apiKey: 'owox_key_fixture',
  name: 'Automation',
  expiresAt: null,
  createdAt: '2026-05-30T18:00:00.000Z',
  lastAuthenticatedAt: null,
};

describe('SecretRevealDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
    });
  });

  it('shows one API Key field', () => {
    render(<SecretRevealDialog data={createdKey} onDone={vi.fn()} />);

    const apiKeyInput = screen.getByLabelText('API Key');

    expect(apiKeyInput).toHaveValue('owox_key_fixture');
    expect(apiKeyInput).toHaveAttribute('readonly');
    expect(screen.queryByText('API Origin')).not.toBeInTheDocument();
    expect(screen.queryByText('API Key Secret')).not.toBeInTheDocument();
  });

  it('keeps the API Key input out of the initial dialog focus order', () => {
    render(<SecretRevealDialog data={createdKey} onDone={vi.fn()} />);

    expect(screen.getByLabelText('API Key')).toHaveAttribute('tabindex', '-1');
  });

  it('hides the API Key by default and allows revealing it', () => {
    render(<SecretRevealDialog data={createdKey} onDone={vi.fn()} />);

    const apiKeyInput = screen.getByLabelText('API Key');

    expect(apiKeyInput).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: 'Show API Key' }));
    expect(apiKeyInput).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByRole('button', { name: 'Hide API Key' }));
    expect(apiKeyInput).toHaveAttribute('type', 'password');
  });

  it('uses a compact copy button for the API Key', () => {
    render(<SecretRevealDialog data={createdKey} onDone={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Copy API Key' })).toHaveClass('size-7');
  });

  it('copies the API Key', async () => {
    render(<SecretRevealDialog data={createdKey} onDone={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy API Key' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('owox_key_fixture');
    });
  });

  it('places the one-time key notice under the API Key field', () => {
    render(<SecretRevealDialog data={createdKey} onDone={vi.fn()} />);

    const apiKeyInput = screen.getByLabelText('API Key');
    const apiKeyField = apiKeyInput.closest('div')?.parentElement;

    expect(apiKeyField).toHaveTextContent(
      "Copy the API Key now. You won't be able to see it again."
    );
  });

  it('shows the API Keys documentation link as a secondary footer action', () => {
    render(<SecretRevealDialog data={createdKey} onDone={vi.fn()} />);

    const docsLink = screen.getByRole('link', { name: 'API Keys documentation' });

    expect(docsLink).toHaveAttribute('href', 'https://docs.owox.com/docs/api/api-keys/');
    expect(docsLink.closest('[data-slot="dialog-footer"]')).not.toBeNull();
    expect(docsLink).not.toHaveClass('hover:bg-muted');
  });

  it('shows one help control for the API Key caption', () => {
    render(<SecretRevealDialog data={createdKey} onDone={vi.fn()} />);

    expect(screen.getAllByRole('button', { name: 'Help information' })).toHaveLength(1);
  });
});

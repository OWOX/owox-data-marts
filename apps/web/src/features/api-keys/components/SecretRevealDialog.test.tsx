import type { ReactNode } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SecretRevealDialog } from './SecretRevealDialog';
import type { CreateProjectMemberApiKeyResponse } from '../types';
import type { useFlags } from '../../../app/store/hooks/useFlags';

type UseFlagsResult = ReturnType<typeof useFlags>;

const useFlagsMock = vi.hoisted(() =>
  vi.fn<() => UseFlagsResult>(() => ({
    flags: { PUBLIC_ORIGIN: 'https://public.example.test' },
    callState: 'loaded' as UseFlagsResult['callState'],
  }))
);

vi.mock('../../../app/store/hooks/useFlags', () => ({
  useFlags: useFlagsMock,
}));

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
  apiKeySecret: 'secret-value',
  name: 'Automation',
  expiresAt: null,
  createdAt: '2026-05-30T18:00:00.000Z',
  lastAuthenticatedAt: null,
};

describe('SecretRevealDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFlagsMock.mockReturnValue({
      flags: { PUBLIC_ORIGIN: 'https://public.example.test' },
      callState: 'loaded' as UseFlagsResult['callState'],
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
    });
  });

  it('shows the current API Origin as a read-only input', () => {
    render(<SecretRevealDialog data={createdKey} onDone={vi.fn()} />);

    const originInput = screen.getByLabelText('API Origin');

    expect(originInput).toHaveValue('https://public.example.test');
    expect(originInput).toHaveAttribute('readonly');
  });

  it('keeps the API Origin input out of the initial dialog focus order', () => {
    render(<SecretRevealDialog data={createdKey} onDone={vi.fn()} />);

    expect(screen.getByLabelText('API Origin')).toHaveAttribute('tabindex', '-1');
  });

  it('uses the same compact copy button styling for API Origin as other values', () => {
    render(<SecretRevealDialog data={createdKey} onDone={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Copy API Origin' })).toHaveClass('size-7');
  });

  it('copies the API Origin', async () => {
    render(<SecretRevealDialog data={createdKey} onDone={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy API Origin' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://public.example.test');
    });
  });

  it('keeps the API Key Secret copy button as a copy icon after copying', async () => {
    render(<SecretRevealDialog data={createdKey} onDone={vi.fn()} />);

    const secretButton = screen.getByRole('button', { name: 'Copy API Key Secret' });

    fireEvent.click(secretButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('secret-value');
    });
    expect(secretButton.querySelector('.lucide-copy')).toBeTruthy();
    expect(secretButton.querySelector('.lucide-check')).toBeNull();
  });

  it('hides the API Key Secret until explicitly revealed', () => {
    render(<SecretRevealDialog data={createdKey} onDone={vi.fn()} />);

    const secretInput = screen.getByLabelText('API Key Secret');

    expect(secretInput).toHaveAttribute('type', 'password');
    expect(screen.queryByText('secret-value')).not.toBeInTheDocument();
  });

  it('allows the API Key Secret to be revealed and hidden again', () => {
    render(<SecretRevealDialog data={createdKey} onDone={vi.fn()} />);

    const secretInput = screen.getByLabelText('API Key Secret');

    fireEvent.click(screen.getByRole('button', { name: 'Show API Key Secret' }));
    expect(secretInput).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByRole('button', { name: 'Hide API Key Secret' }));
    expect(secretInput).toHaveAttribute('type', 'password');
  });

  it('places the one-time secret notice under the API Key Secret field', () => {
    render(<SecretRevealDialog data={createdKey} onDone={vi.fn()} />);

    const secretInput = screen.getByLabelText('API Key Secret');
    const secretField = secretInput.closest('div')?.parentElement;

    expect(secretField).toHaveTextContent(
      "Copy the secret now. You won't be able to see it again."
    );
  });

  it('shows the API Keys documentation link as a secondary footer action', () => {
    render(<SecretRevealDialog data={createdKey} onDone={vi.fn()} />);

    const docsLink = screen.getByRole('link', { name: 'API Keys documentation' });

    expect(docsLink).toHaveAttribute('href', 'https://docs.owox.com/docs/api/api-keys/');
    expect(docsLink.closest('[data-slot="dialog-footer"]')).not.toBeNull();
    expect(docsLink).not.toHaveClass('hover:bg-muted');
  });

  it('shows help controls for each value caption', () => {
    render(<SecretRevealDialog data={createdKey} onDone={vi.fn()} />);

    expect(screen.getAllByRole('button', { name: 'Help information' })).toHaveLength(3);
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'react-hot-toast';
import { CopyContextLinkButton } from './CopyContextLinkButton';

vi.mock('../../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: (path: string) => `/ui/project${path}` }),
}));
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn() } }));

describe('CopyContextLinkButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('copies an absolute project-scoped URL with the stable context ID', async () => {
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(<CopyContextLinkButton contextId='context-1' />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link to context' }));
    await screen.findByRole('button', { name: 'Context link copied' });
    expect(write).toHaveBeenCalledWith(
      `${window.location.origin}/ui/project/project-settings/contexts?context=context-1`
    );
    expect(toast.error).not.toHaveBeenCalled();
  });
  it('reports clipboard failure without a success state', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Denied'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<CopyContextLinkButton contextId='context-1' />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link to context' }));
    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button', { name: 'Context link copied' })).not.toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DocumentLinkDescription from './DocumentLinkDescription';

describe('DocumentLinkDescription', () => {
  const accessEmail = 'report-writer@example.iam.gserviceaccount.com';
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
  });

  it('shows and copies the selected destination access email', async () => {
    render(<DocumentLinkDescription accessEmail={accessEmail} />);

    fireEvent.click(screen.getByText('How do I get a correct document link?'));

    const copyableEmail = screen.getByRole('button', { name: accessEmail });
    fireEvent.click(copyableEmail);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(accessEmail);
    });
    expect(screen.getByText(/following email/i)).toBeInTheDocument();
  });

  it('keeps the generic instruction when the destination email is unavailable', () => {
    render(<DocumentLinkDescription />);

    fireEvent.click(screen.getByText('How do I get a correct document link?'));

    expect(screen.getByText(/service account email/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: accessEmail })).not.toBeInTheDocument();
  });
});

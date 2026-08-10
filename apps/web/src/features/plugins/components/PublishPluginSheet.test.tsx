import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const publish = vi.fn();

vi.mock('../hooks/usePluginPublications', () => ({
  usePublishableScopes: () => ['project', 'member'],
  usePluginPublishing: () => ({ publish, isPublishing: false }),
}));

import { PublishPluginSheet } from './PublishPluginSheet';

describe('PublishPluginSheet', () => {
  beforeEach(() => {
    publish.mockReset();
    publish.mockResolvedValue(null);
  });

  /**
   * AppForm renders a <form>. A second <form> nested inside it is invalid HTML, and it
   * leaves the submit button owned by an element whose handler never runs -- the browser
   * navigates instead, which reads as the page reloading with nothing saved.
   */
  /**
   * Collapsed, not absent: someone republishing a repository they know needs none of it,
   * and someone doing it the first time has to be told what the choice actually changes.
   */
  it('explains each field behind a collapsed section', () => {
    render(<PublishPluginSheet isOpen onClose={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Which repositories can be published' })
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'What each option does' })).toBeTruthy();
    // Collapsed: the explanation is not on screen until asked for.
    expect(screen.queryByText(/OWOX Data Marts GitHub App/)).toBeNull();
  });

  it('names the GitHub App as what unlocks a private repository', () => {
    render(<PublishPluginSheet isOpen onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Which repositories can be published' }));

    expect(screen.getByText(/OWOX Data Marts GitHub App/)).toBeTruthy();
  });

  it('renders exactly one form element', () => {
    render(<PublishPluginSheet isOpen onClose={vi.fn()} />);

    expect(document.querySelectorAll('form')).toHaveLength(1);
  });

  it('publishes the typed repository instead of submitting natively', async () => {
    const onClose = vi.fn();
    render(<PublishPluginSheet isOpen onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText('OWOX/example-plugin'), {
      target: { value: 'romandubovyi/owox-plugin-example' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => {
      expect(publish).toHaveBeenCalledWith('romandubovyi/owox-plugin-example', 'project');
    });
    expect(onClose).toHaveBeenCalled();
  });
});

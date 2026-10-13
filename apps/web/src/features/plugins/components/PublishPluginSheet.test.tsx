import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const publish = vi.fn();
const navigate = vi.fn();

vi.mock('../hooks/usePluginPublications', () => ({
  usePublishableScopes: () => ['project', 'member'],
  usePluginPublishing: () => ({ publish, isPublishing: false }),
}));
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => navigate };
});
vi.mock('../../../shared/hooks/useProjectRoute', () => ({
  useProjectRoute: () => ({ scope: (path: string) => `/ui/project-1${path}` }),
}));

import { PublishPluginSheet } from './PublishPluginSheet';

describe('PublishPluginSheet', () => {
  beforeEach(() => {
    publish.mockReset();
    navigate.mockReset();
    publish.mockResolvedValue({ failure: null, pluginId: 'p1' });
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

  // Installing is the default: a published plugin nobody installed is missing from the menu.
  it('publishes the typed repository and opens it for installing', async () => {
    const onClose = vi.fn();
    render(<PublishPluginSheet isOpen onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText('OWOX/example-plugin'), {
      target: { value: 'romandubovyi/owox-plugin-example' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish & Install' }));

    await waitFor(() => {
      expect(publish).toHaveBeenCalledWith('romandubovyi/owox-plugin-example', 'project', {
        mentionInstalled: true,
      });
    });
    expect(onClose).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/ui/project-1/plugins/p1/open');
  });

  it('publishes without installing from Publish only', async () => {
    const onClose = vi.fn();
    render(<PublishPluginSheet isOpen onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText('OWOX/example-plugin'), {
      target: { value: 'OWOX/import-model' },
    });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More publish options' }));
    fireEvent.click(await within(document.body).findByText('Publish only'));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(publish).toHaveBeenCalledWith('OWOX/import-model', 'project', {
      mentionInstalled: true,
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('checks the repository before publishing from Publish only', async () => {
    render(<PublishPluginSheet isOpen onClose={vi.fn()} />);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'More publish options' }));
    fireEvent.click(await within(document.body).findByText('Publish only'));

    expect(await screen.findByText('A GitHub repository is required')).toBeTruthy();
    expect(publish).not.toHaveBeenCalled();
  });

  it('stays on the sheet with the reason when publishing fails', async () => {
    publish.mockResolvedValue({ failure: { message: 'OWOX cannot read OWOX/import-model' } });
    const onClose = vi.fn();
    render(<PublishPluginSheet isOpen onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText('OWOX/example-plugin'), {
      target: { value: 'OWOX/import-model' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish & Install' }));

    expect(await screen.findByText('OWOX cannot read OWOX/import-model')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  // The request settles before publish does -- it still looks up whether the member already
  // has the plugin -- so the button must stay disabled until the sheet closes.
  it('keeps Publish & Install disabled until publishing has fully finished', async () => {
    let finish: (value: unknown) => void = () => undefined;
    publish.mockReturnValue(new Promise(resolve => (finish = resolve)));
    const onClose = vi.fn();
    render(<PublishPluginSheet isOpen onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText('OWOX/example-plugin'), {
      target: { value: 'OWOX/import-model' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish & Install' }));

    const pending = await screen.findByRole('button', { name: 'Publishing…' });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'More publish options' })).toHaveProperty(
      'disabled',
      true
    );
    fireEvent.click(pending);
    expect(publish).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish({ failure: null, pluginId: 'p1' });
    });
    expect(onClose).toHaveBeenCalled();
  });

  // Publish & Install navigates once it finishes, so the sheet must not close under it.
  it('stays open on Escape until publishing has finished', async () => {
    let finish: (value: unknown) => void = () => undefined;
    publish.mockReturnValue(new Promise(resolve => (finish = resolve)));
    const onClose = vi.fn();
    render(<PublishPluginSheet isOpen onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText('OWOX/example-plugin'), {
      target: { value: 'OWOX/import-model' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish & Install' }));
    await screen.findByRole('button', { name: 'Publishing…' });
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      finish({ failure: null, pluginId: 'p1' });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/ui/project-1/plugins/p1/open');
  });
});

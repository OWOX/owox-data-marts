import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataMartSetupAssistantActions } from './DataMartSetupAssistantActions';
import { isInsideIgnoredDismissPortal } from '@owox/ui/lib/dismissable-portals';

const mocks = vi.hoisted(() => ({ showError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: mocks.showError } }));

describe('DataMartSetupAssistantActions', () => {
  const writeText = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it.each([
    ['ChatGPT', 'https://chatgpt.com/', 'codex:', 'new', '', 'prompt'],
    ['Claude', 'https://claude.ai/new', 'claude:', 'claude.ai', '/new', 'q'],
  ])(
    'offers browser and desktop choices for %s with intact project context',
    async (name, browserAddress, protocol, hostname, pathname, parameter) => {
      render(
        <DataMartSetupAssistantActions
          projectId='проєкт & team/#?'
          dataMartId='mart+é/😀'
          mcpServerUrl='https://project.mcp.owox.com/mcp'
        />
      );

      expect(screen.getAllByRole('button')).toHaveLength(3);
      fireEvent.keyDown(screen.getByRole('button', { name }), { key: 'Enter' });
      const browser = await screen.findByRole('menuitem', { name: 'Open in browser' });
      const desktop = screen.getByRole('menuitem', { name: 'Open in desktop app' });
      const browserUrl = new URL(browser.getAttribute('href')!);
      const desktopUrl = new URL(desktop.getAttribute('href')!);
      expect(browserUrl.origin + browserUrl.pathname).toBe(browserAddress);
      expect(desktopUrl.protocol).toBe(protocol);
      expect(desktopUrl.hostname).toBe(hostname);
      expect(desktopUrl.pathname).toBe(pathname);
      expect([...browserUrl.searchParams.keys()]).toEqual(['q']);
      expect([...desktopUrl.searchParams.keys()]).toEqual([parameter]);
      const prompt = browserUrl.searchParams.get('q');
      expect(prompt).toContain('Project ID: проєкт & team/#?');
      expect(prompt).toContain('Data Mart ID: mart+é/😀');
      expect(prompt).toContain('Use the OWOX Data Marts MCP');
      expect(desktopUrl.searchParams.get(parameter)).toBe(prompt);
      expect(browser).toHaveAttribute('target', '_blank');
      expect(browser).toHaveAttribute('rel', 'noopener noreferrer');
      expect(desktop).not.toHaveAttribute('target');
      for (const link of [browser, desktop]) {
        expect(isInsideIgnoredDismissPortal(link)).toBe(true);
      }
    }
  );

  it('copies the setup prompt without requiring either client', async () => {
    render(<DataMartSetupAssistantActions projectId='project-copy' dataMartId='mart-copy' />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Project ID: project-copy'));
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Data Mart ID: mart-copy'));
    expect(await screen.findByRole('button', { name: 'Prompt copied' })).toBeVisible();
    expect(mocks.showError).not.toHaveBeenCalled();
  });

  it('reports a rejected clipboard operation while keeping both links available', async () => {
    writeText.mockRejectedValue(new Error('Clipboard denied'));
    const logError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<DataMartSetupAssistantActions projectId='project-1' />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));

    await waitFor(() => {
      expect(mocks.showError).toHaveBeenCalled();
    });
    expect(screen.getByRole('button', { name: 'Copy prompt' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'ChatGPT' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Claude' })).toBeVisible();
    logError.mockRestore();
  });
});

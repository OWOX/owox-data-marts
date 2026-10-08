import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UninstallPluginDialog } from './UninstallPluginDialog';

const renderDialog = (
  over: Partial<Parameters<typeof UninstallPluginDialog>[0]> = {}
): Parameters<typeof UninstallPluginDialog>[0] => {
  const props = {
    plugin: { displayName: 'Example Plugin', credentialRequirements: [] },
    open: true,
    onOpenChange: vi.fn(),
    onConfirm: vi.fn(),
    isUninstalling: false,
    ...over,
  };
  render(<UninstallPluginDialog {...props} />);
  return props;
};

describe('UninstallPluginDialog', () => {
  it('names the plugin and what uninstalling does not touch', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Uninstall this plugin?' })).toBeInTheDocument();
    expect(screen.getByText('Example Plugin')).toBeInTheDocument();
    // Members confuse uninstalling with unpublishing, in both directions.
    expect(screen.getByText(/Who can find it does not change/)).toBeInTheDocument();
    expect(screen.getByText(/restore it later from Installation history/)).toBeInTheDocument();
  });

  it('warns about Credential access only for a plugin that asked for it', () => {
    renderDialog();
    expect(screen.queryByText(/Credential access you granted ends/)).toBeNull();
  });

  it('says restoring asks for Credential access again', () => {
    renderDialog({
      plugin: {
        displayName: 'Example Plugin',
        credentialRequirements: [{ id: 'openai', optional: false }],
      },
    });

    expect(screen.getByText(/Restoring asks for it again/)).toBeInTheDocument();
  });

  it('uninstalls only on confirmation', () => {
    const props = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Uninstall' }));

    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancels without uninstalling', () => {
    const props = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  // A second click while the first request runs would send the same uninstall twice.
  it('holds the confirmation while the uninstall runs', () => {
    renderDialog({ isUninstalling: true });

    expect(screen.getByRole('button', { name: 'Uninstalling…' })).toBeDisabled();
  });
});

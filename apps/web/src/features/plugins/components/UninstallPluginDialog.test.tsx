import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UninstallPluginDialog } from './UninstallPluginDialog';

const renderDialog = (
  over: Partial<Parameters<typeof UninstallPluginDialog>[0]> = {}
): Parameters<typeof UninstallPluginDialog>[0] => {
  const props = {
    plugin: {
      displayName: 'Example Plugin',
      credentialRequirements: [],
      suspended: false,
      currentVersionId: 'v1',
    },
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
        suspended: false,
        currentVersionId: 'v1',
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

  // The request finishes anyway; a dialog dismissed now would be followed by "uninstalled".
  it('cannot be dismissed while the uninstall runs', () => {
    const props = renderDialog({ isUninstalling: true });

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  // Restore re-runs the install, which a suspension or a missing current version refuses.
  it.each([
    ['suspended', { suspended: true, currentVersionId: 'v1' }],
    ['without a current version', { suspended: false, currentVersionId: null }],
  ])('does not promise a restore for a plugin that is %s', (_, state) => {
    renderDialog({
      plugin: { displayName: 'Example Plugin', credentialRequirements: [], ...state },
    });

    expect(screen.queryByText(/You can restore it later/)).toBeNull();
    expect(screen.getByText(/once the plugin is available again/)).toBeInTheDocument();
  });

  // Announced with the question rather than left for the reader to find.
  it('describes the dialog with what uninstalling does and does not change', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Uninstall this plugin?' });
    expect(dialog).toHaveAccessibleDescription(/Who can find it does not change/);
  });

  it('closes on Escape once nothing is running', () => {
    const props = renderDialog();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  // An optional requirement may have been answered "Do not grant", so the warning hedges.
  it('words the Credential warning for access that may never have been granted', () => {
    renderDialog({
      plugin: {
        displayName: 'Example Plugin',
        credentialRequirements: [{ id: 'openai', optional: true }],
        suspended: false,
        currentVersionId: 'v1',
      },
    });

    expect(screen.getByText(/^Any Credential access you granted ends/)).toBeInTheDocument();
  });
});

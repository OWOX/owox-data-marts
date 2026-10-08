import { useCallback, useState, type ReactNode } from 'react';
import type { PluginGalleryEntry } from '../types';
import { UninstallPluginDialog } from './UninstallPluginDialog';

type UninstallTarget = Pick<
  PluginGalleryEntry,
  'pluginId' | 'displayName' | 'credentialRequirements'
>;

interface PendingUninstall {
  plugin: UninstallTarget;
  /** Where focus goes back to once the dialog closes, usually the menu button that opened it. */
  returnFocusTo: HTMLElement | null;
}

/**
 * The uninstall confirmation, for every surface that offers Uninstall.
 *
 * One contract wherever it is asked from: the dialog closes only once the uninstall
 * succeeded, stays open after a failure (the action has already said why), and cannot be
 * dismissed while the request runs. Focus goes back to whatever opened it, or to
 * `fallbackFocus` when that element left with the plugin it belonged to.
 *
 * Takes `uninstall` rather than calling usePluginActions itself, so a surface that already
 * holds the plugin actions does not start a second set of mutations.
 */
export function useUninstallConfirmation({
  uninstall,
  isUninstalling,
  fallbackFocus,
}: {
  uninstall: (pluginId: string) => Promise<void>;
  isUninstalling: boolean;
  fallbackFocus?: () => HTMLElement | null;
}): {
  requestUninstall: (plugin: UninstallTarget, returnFocusTo?: HTMLElement | null) => void;
  uninstallDialog: ReactNode;
} {
  const [pending, setPending] = useState<PendingUninstall | null>(null);

  const requestUninstall = useCallback(
    (plugin: UninstallTarget, returnFocusTo: HTMLElement | null = null) => {
      setPending({ plugin, returnFocusTo });
    },
    []
  );

  const confirm = async (target: PendingUninstall) => {
    try {
      await uninstall(target.plugin.pluginId);
      // Only the request this dialog started may close it.
      setPending(current => (current === target ? null : current));
    } catch {
      // The action has already said why; the dialog stays open for another try.
    }
  };

  const uninstallDialog = pending ? (
    <UninstallPluginDialog
      plugin={pending.plugin}
      open
      onOpenChange={open => {
        if (!open) {
          setPending(null);
        }
      }}
      onConfirm={() => void confirm(pending)}
      isUninstalling={isUninstalling}
      onCloseAutoFocus={event => {
        event.preventDefault();
        const target = pending.returnFocusTo?.isConnected
          ? pending.returnFocusTo
          : fallbackFocus?.();
        target?.focus();
      }}
    />
  ) : null;

  return { requestUninstall, uninstallDialog };
}

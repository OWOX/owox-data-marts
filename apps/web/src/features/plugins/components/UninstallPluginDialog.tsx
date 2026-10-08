import { History, KeyRound, Users } from 'lucide-react';
import { ConfirmationDialog } from '../../../shared/components/ConfirmationDialog/ConfirmationDialog';
import type { PluginGalleryEntry } from '../types';
import { DialogFact } from './DialogFact';

interface UninstallPluginDialogProps {
  plugin: Pick<PluginGalleryEntry, 'displayName' | 'credentialRequirements'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isUninstalling: boolean;
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * Confirmation before a member stops a plugin for themselves.
 *
 * Uninstalling is soft and restorable, but not free to undo: the Credential access the member
 * granted ends with it, and restoring asks for it again. A menu entry is also an easy place
 * to click by mistake. So it asks once, and says what does not change -- who can find the
 * plugin and everyone else's installation -- because unpublishing and uninstalling are the
 * two actions members confuse.
 *
 * It cannot be dismissed while the request runs: the request would finish anyway, and a
 * dialog closed by Cancel would be followed by "Plugin uninstalled".
 */
export function UninstallPluginDialog({
  plugin,
  open,
  onOpenChange,
  onConfirm,
  isUninstalling,
  onCloseAutoFocus,
}: UninstallPluginDialogProps) {
  const hasCredentialRequirements = (plugin.credentialRequirements?.length ?? 0) > 0;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={next => {
        if (!next && isUninstalling) {
          return;
        }
        onOpenChange(next);
      }}
      title='Uninstall this plugin?'
      description={
        <p className='break-words'>
          <span className='font-medium [overflow-wrap:anywhere]'>{plugin.displayName}</span> stops
          for you and leaves your menu.
        </p>
      }
      confirmLabel={isUninstalling ? 'Uninstalling…' : 'Uninstall'}
      cancelLabel='Cancel'
      confirmDisabled={isUninstalling}
      cancelDisabled={isUninstalling}
      onConfirm={onConfirm}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <div className='flex flex-col gap-3 rounded-md border p-3 text-sm'>
        <DialogFact icon={Users}>
          Who can find it does not change, and other members keep their installations.
        </DialogFact>
        <DialogFact icon={History}>You can restore it later from Installation history.</DialogFact>
        {/* "Any": an optional requirement may have been answered "Do not grant". */}
        {hasCredentialRequirements && (
          <DialogFact icon={KeyRound}>
            Any Credential access you granted ends. Restoring asks for it again.
          </DialogFact>
        )}
      </div>
    </ConfirmationDialog>
  );
}

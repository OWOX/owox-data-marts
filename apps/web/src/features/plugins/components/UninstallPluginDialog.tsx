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
}

/**
 * Confirmation before a member stops a plugin for themselves.
 *
 * Uninstalling is soft and restorable, but not free to undo: the Credential access the member
 * granted ends with it, and restoring asks for it again. A menu entry is also an easy place
 * to click by mistake. So it asks once, and says what does not change -- who can find the
 * plugin and everyone else's installation -- because unpublishing and uninstalling are the
 * two actions members confuse.
 */
export function UninstallPluginDialog({
  plugin,
  open,
  onOpenChange,
  onConfirm,
  isUninstalling,
}: UninstallPluginDialogProps) {
  const hasCredentialRequirements = (plugin.credentialRequirements?.length ?? 0) > 0;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
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
      onConfirm={onConfirm}
    >
      <div className='flex flex-col gap-3 rounded-md border p-3 text-sm'>
        <DialogFact icon={<Users className='size-4 shrink-0' aria-hidden />}>
          Who can find it does not change, and other members keep their installations.
        </DialogFact>
        <DialogFact icon={<History className='size-4 shrink-0' aria-hidden />}>
          You can restore it later from Installation history.
        </DialogFact>
        {hasCredentialRequirements && (
          <DialogFact icon={<KeyRound className='size-4 shrink-0' aria-hidden />}>
            The Credential access you granted ends. Restoring asks for it again.
          </DialogFact>
        )}
      </div>
    </ConfirmationDialog>
  );
}

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@owox/ui/components/alert-dialog';
import { Button } from '@owox/ui/components/button';
import type { SchemaGuardIntent } from '../../model';

interface SchemaUnsavedChangesDialogProps {
  open: boolean;
  intent: SchemaGuardIntent;
  isSaving?: boolean;
  onSaveAndContinue: () => void;
  onDiscardAndContinue: () => void;
  onCancel: () => void;
}

const DESCRIPTIONS: Record<SchemaGuardIntent, string> = {
  ai: 'AI metadata is generated from the saved schema. Save to include your changes, or discard to ignore them.',
  refresh:
    'Refreshing reloads the schema from the source. Save to keep your changes, or discard to lose them.',
  publish:
    'Publishing refreshes the schema from the source. Save to keep your changes, or discard to lose them.',
  definition:
    'Saving the input source refreshes the schema. Save to keep your schema changes, or discard to lose them.',
  navigation:
    'You have unsaved schema changes. Save to keep them, or discard them to leave this page.',
};

export function SchemaUnsavedChangesDialog({
  open,
  intent,
  isSaving = false,
  onSaveAndContinue,
  onDiscardAndContinue,
  onCancel,
}: SchemaUnsavedChangesDialogProps) {
  const verb = intent === 'navigation' ? 'leave' : 'continue';
  return (
    <AlertDialog
      open={open}
      onOpenChange={isOpen => {
        // While a save is in flight the buttons are disabled; keep Escape /
        // outside-click from cancelling too, which would drop the pending
        // follow-up action even though the schema is being persisted.
        if (!isOpen && !isSaving) {
          onCancel();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved schema changes</AlertDialogTitle>
          <AlertDialogDescription>{DESCRIPTIONS[intent]}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
          <Button
            type='button'
            variant='outline'
            onClick={onDiscardAndContinue}
            disabled={isSaving}
          >
            Discard &amp; {verb}
          </Button>
          <Button type='button' onClick={onSaveAndContinue} disabled={isSaving}>
            Save &amp; {verb}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export type { SchemaUnsavedChangesDialogProps };

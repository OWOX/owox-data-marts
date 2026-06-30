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
import type { SchemaGuardIntent } from '../../model/hooks';

interface SchemaUnsavedChangesDialogProps {
  open: boolean;
  intent: SchemaGuardIntent;
  isSaving?: boolean;
  onSaveAndContinue: () => void;
  onDiscardAndContinue: () => void;
  onCancel: () => void;
}

const DESCRIPTIONS: Record<SchemaGuardIntent, string> = {
  ai: 'AI metadata is generated against the saved schema, so your unsaved changes would be ignored.',
  refresh: 'Refreshing reloads the schema from the source. Your unsaved changes would be lost.',
  publish: 'Publishing refreshes the schema. Your unsaved changes would be lost.',
  definition:
    'Saving the input source refreshes the schema. Your unsaved schema changes would be lost.',
  navigation: 'You have unsaved schema changes. Leaving this page will discard them.',
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
        if (!isOpen) {
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

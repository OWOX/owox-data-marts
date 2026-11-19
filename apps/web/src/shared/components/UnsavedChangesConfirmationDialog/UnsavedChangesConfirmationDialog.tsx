import { ConfirmationDialog } from '../ConfirmationDialog';

/**
 * Standard "exit without saving?" confirmation for a page or a sheet form with unsaved changes.
 *
 * In a sheet, render it *inside* the sheet's `SheetContent` (not as a sibling of `Sheet`) so
 * Radix treats it as a nested dismissable layer. Then interacting with the dialog does not
 * dismiss the host sheet (which previously re-opened the dialog and trapped the user in a
 * loop).
 */
interface UnsavedChangesConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  description?: string;
}

export function UnsavedChangesConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  description,
}: UnsavedChangesConfirmationDialogProps) {
  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      title='Unsaved Changes'
      description={
        description ? (
          <span className='[overflow-wrap:anywhere]'>{description}</span>
        ) : (
          'You have unsaved changes. Exit without saving?'
        )
      }
      confirmLabel='Yes, leave now'
      cancelLabel='No, stay here'
      onConfirm={onConfirm}
      variant='destructive'
    />
  );
}

export type { UnsavedChangesConfirmationDialogProps };

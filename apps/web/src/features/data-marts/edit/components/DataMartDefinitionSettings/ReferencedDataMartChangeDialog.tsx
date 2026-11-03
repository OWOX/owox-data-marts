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
import {
  ReferencingDataMartsNotice,
  type ReferencingDataMarts,
} from '../../../shared/components/ReferencingDataMartsNotice';

interface ReferencedDataMartChangeDialogProps {
  open: boolean;
  referencing: ReferencingDataMarts;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirms saving a new input source for a Data Mart that other Data Marts reference in SQL. */
export function ReferencedDataMartChangeDialog({
  open,
  referencing,
  onConfirm,
  onCancel,
}: ReferencedDataMartChangeDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={isOpen => {
        if (!isOpen) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Save changes to a referenced Data Mart?</AlertDialogTitle>
          <AlertDialogDescription>
            Other Data Marts read this one through references in their SQL. If this change removes
            or renames columns they use, their queries will fail.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ReferencingDataMartsNotice {...referencing} action='change' />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button type='button' onClick={onConfirm}>
            Save anyway
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

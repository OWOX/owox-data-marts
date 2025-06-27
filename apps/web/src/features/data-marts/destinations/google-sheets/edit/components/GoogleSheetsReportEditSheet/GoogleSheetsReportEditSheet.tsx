import { useState, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@owox/ui/components/sheet';
import { Button } from '@owox/ui/components/button';
import { ConfirmationDialog } from '../../../../../../../shared/components/ConfirmationDialog';
import { GoogleSheetsReportEditForm } from '../GoogleSheetsReportEditForm';
import type { GoogleSheetsReport } from '../../../shared/types';

interface GoogleSheetsReportEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  initialReport?: GoogleSheetsReport;
  mode?: 'edit' | 'create';
}

export function GoogleSheetsReportEditSheet({
  isOpen,
  onClose,
  initialReport,
  mode = 'edit',
}: GoogleSheetsReportEditSheetProps) {
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Memoize close handler to avoid unnecessary re-renders
  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowUnsavedDialog(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  // Memoize confirm close handler
  const confirmClose = useCallback(() => {
    setShowUnsavedDialog(false);
    setIsDirty(false);
    onClose();
  }, [onClose]);

  // Handle form submit success
  const handleFormSubmitSuccess = useCallback(() => {
    setIsDirty(false);
    onClose();
  }, [onClose]);

  // Handle form dirty state change
  const handleFormDirtyChange = useCallback((dirty: boolean) => {
    setIsDirty(dirty);
  }, []);

  return (
    <>
      <Sheet
        open={isOpen}
        onOpenChange={open => {
          if (!open) {
            handleClose();
          }
        }}
      >
        <SheetContent className='flex h-full min-w-[480px] flex-col gap-0'>
          <SheetHeader className='border-b py-3'>
            <SheetTitle>{mode === 'create' ? 'Create new report' : 'Edit report'}</SheetTitle>
            <SheetDescription>
              {mode === 'create'
                ? 'Fill in the details to create a new Google Sheets report'
                : 'Update details of an existing Google Sheets report'}
            </SheetDescription>
          </SheetHeader>

          <GoogleSheetsReportEditForm
            initialReport={initialReport}
            mode={mode}
            onSubmitSuccess={handleFormSubmitSuccess}
            onDirtyChange={handleFormDirtyChange}
          />

          <SheetFooter className='flex flex-col gap-1.5 border-t py-3'>
            <Button
              variant='default'
              type='submit'
              form='google-sheets-edit-form'
              className='bg-brand-blue-500 hover:bg-brand-blue-600 text-brand-blue-500-foreground hover:text-brand-blue-600-foreground w-full'
              aria-label={mode === 'create' ? 'Create new report' : 'Save changes to report'}
            >
              Save
            </Button>
            <Button
              variant='outline'
              type='button'
              onClick={handleClose}
              className='w-full'
              aria-label='Cancel and close form'
            >
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmationDialog
        open={showUnsavedDialog}
        onOpenChange={setShowUnsavedDialog}
        title='Unsaved Changes'
        description='You have unsaved changes. Exit without saving?'
        confirmLabel='Yes, leave now'
        cancelLabel='No, stay here'
        onConfirm={confirmClose}
        variant='destructive'
      />
    </>
  );
}

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@owox/ui/components/sheet';
import { useCallback, useState } from 'react';
import { ConfirmationDialog } from '../../../../../../shared/components/ConfirmationDialog';
import { DataDestinationProvider } from '../../../../../data-destination';
import type { DataDestination } from '../../../../../data-destination';
import { ReportFormMode } from '../../../shared';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { EmailReportEditForm } from '../EmailReportEditForm';

interface EmailReportEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  initialReport?: DataMartReport;
  mode: ReportFormMode;
  preSelectedDestination?: DataDestination | null;
}

export function EmailReportEditSheet({
  isOpen,
  onClose,
  initialReport,
  mode,
  preSelectedDestination,
}: EmailReportEditSheetProps) {
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowUnsavedDialog(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const confirmClose = useCallback(() => {
    setShowUnsavedDialog(false);
    setIsDirty(false);
    onClose();
  }, [onClose]);

  const handleFormDirtyChange = useCallback((dirty: boolean) => {
    setIsDirty(dirty);
  }, []);

  const handleFormSubmitSuccess = useCallback(() => {
    setIsDirty(false);
    onClose();
  }, [onClose]);

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
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{preSelectedDestination?.title ?? 'Report'}</SheetTitle>
            <SheetDescription>
              {mode === ReportFormMode.CREATE
                ? 'Fill in the details to create a new report'
                : 'Update details of an existing report'}
            </SheetDescription>
          </SheetHeader>

          <DataDestinationProvider>
            <EmailReportEditForm
              initialReport={initialReport}
              mode={mode}
              onDirtyChange={handleFormDirtyChange}
              onSubmit={handleFormSubmitSuccess}
              onCancel={handleClose}
              preSelectedDestination={preSelectedDestination}
            />
          </DataDestinationProvider>
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

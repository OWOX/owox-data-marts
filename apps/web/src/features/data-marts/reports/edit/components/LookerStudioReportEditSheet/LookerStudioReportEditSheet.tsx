import { useState, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@owox/ui/components/sheet';
import { ConfirmationDialog } from '../../../../../../shared/components/ConfirmationDialog';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report.ts';
import { LookerStudioReportEditForm } from '../LookerStudioReportEditForm';
import { DataDestinationProvider } from '../../../../../data-destination';
import { ReportFormMode } from '../../../shared';

interface LookerStudioReportEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  initialReport?: DataMartReport;
  mode: ReportFormMode;
}

export function LookerStudioReportEditSheet({
  isOpen,
  onClose,
  initialReport,
  mode,
}: LookerStudioReportEditSheetProps) {
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
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

  // Handle form dirty state change
  const handleFormDirtyChange = useCallback((dirty: boolean) => {
    setIsDirty(dirty);
  }, []);

  // Handle form submission success
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
            <SheetTitle>
              {mode === ReportFormMode.CREATE
                ? 'Connect Data Mart to Looker Studio'
                : 'Update Looker Studio Connection'}
            </SheetTitle>
            <SheetDescription>
              {mode === ReportFormMode.CREATE
                ? 'Configure Data Mart as a data source for Looker Studio'
                : 'Update Data Mart connection settings for Looker Studio'}
            </SheetDescription>
          </SheetHeader>

          <DataDestinationProvider>
            <LookerStudioReportEditForm
              initialReport={initialReport}
              mode={mode}
              onDirtyChange={handleFormDirtyChange}
              onSubmit={handleFormSubmitSuccess}
              onCancel={handleClose}
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

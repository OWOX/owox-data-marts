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
import type { DataDestination } from '../../../../../data-destination/shared/model/types';

interface LookerStudioReportEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  initialReport?: DataMartReport;
  mode: ReportFormMode;
  preSelectedDestination?: DataDestination | null;
}

export function LookerStudioReportEditSheet({
  isOpen,
  onClose,
  initialReport,
  mode,
  preSelectedDestination,
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
            <SheetTitle>{preSelectedDestination?.title ?? 'Looker Studio'}</SheetTitle>
            <SheetDescription>
              {mode === ReportFormMode.CREATE
                ? 'Set up Data Mart as a data source'
                : 'Update connection details'}
            </SheetDescription>
          </SheetHeader>

          <DataDestinationProvider>
            <LookerStudioReportEditForm
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

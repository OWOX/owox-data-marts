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
import type { DataDestinationType } from '../../../../../data-destination';
import { ReportsProvider } from '../../../shared';
import { toast } from 'sonner';
import { Link, useLocation, useParams } from 'react-router-dom';

interface EmailReportEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  initialReport?: DataMartReport;
  mode: ReportFormMode;
  preSelectedDestination?: DataDestination | null;
  prefill?: {
    title?: string;
    subject?: string;
    messageTemplate?: string;
  };
  allowedDestinationTypes?: DataDestinationType[];
}

export function EmailReportEditSheet({
  isOpen,
  onClose,
  initialReport,
  mode,
  preSelectedDestination,
  prefill,
  allowedDestinationTypes,
}: EmailReportEditSheetProps) {
  // TODO:: Refactor duplicated code fragment
  // GoogleSheetsReportEditSheet, LookerStudioReportEditSheet, ScheduledTriggerFormSheet ...
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const { projectId, id: dataMartId } = useParams<{ projectId: string; id: string }>();
  const { pathname } = useLocation();

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
    const to = projectId && dataMartId ? `/ui/${projectId}/data-marts/${dataMartId}/reports` : '/';
    const isOnDestinationsPage = pathname.includes('/reports');
    if (!isOnDestinationsPage) {
      toast('Report has been created', {
        closeButton: true,
        description: (
          <>
            You can view it in{' '}
            <Link to={to} className='underline underline-offset-4' onClick={() => toast.dismiss()}>
              Destinations
            </Link>{' '}
            page
          </>
        ),
        duration: Infinity,
      });
    }
    onClose();
  }, [onClose, projectId, dataMartId, pathname]);

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

          <ReportsProvider>
            <DataDestinationProvider>
              <EmailReportEditForm
                initialReport={initialReport}
                mode={mode}
                onDirtyChange={handleFormDirtyChange}
                onSubmit={handleFormSubmitSuccess}
                onCancel={handleClose}
                preSelectedDestination={preSelectedDestination}
                prefill={prefill}
                allowedDestinationTypes={allowedDestinationTypes}
              />
            </DataDestinationProvider>
          </ReportsProvider>
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

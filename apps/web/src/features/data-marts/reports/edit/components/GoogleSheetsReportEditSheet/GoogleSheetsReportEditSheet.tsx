import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@owox/ui/components/sheet';
import { CopyLinkButton } from '@owox/ui/components/common/copy-link-button';
import { UnsavedChangesConfirmationDialog } from '../../../../../../shared/components/UnsavedChangesConfirmationDialog';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report.ts';
import { GoogleSheetsReportEditForm } from '../GoogleSheetsReportEditForm';
import { DataDestinationProvider } from '../../../../../data-destination';
import { ReportFormMode } from '../../../shared';
import type { DataDestination } from '../../../../../data-destination';
import { useUnsavedGuard } from '../../../../../../hooks/useUnsavedGuard';
import { useIntercomLauncher } from '../../../../../../shared/hooks/useIntercomLauncher';
import { useReportDeepLink } from '../../hooks/useReportDeepLink';

interface GoogleSheetsReportEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitSuccess?: () => void | Promise<void>;
  initialReport?: DataMartReport;
  mode: ReportFormMode;
  preSelectedDestination?: DataDestination | null;
}

export function GoogleSheetsReportEditSheet({
  isOpen,
  onClose,
  onSubmitSuccess,
  initialReport,
  mode,
  preSelectedDestination,
}: GoogleSheetsReportEditSheetProps) {
  const {
    showUnsavedDialog,
    setShowUnsavedDialog,
    handleClose,
    confirmClose,
    handleFormDirtyChange,
    handleFormSubmitSuccess,
  } = useUnsavedGuard(onClose);

  useIntercomLauncher(isOpen);

  const reportLink = useReportDeepLink(mode === ReportFormMode.EDIT ? initialReport : undefined);

  return (
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
            {mode === ReportFormMode.CREATE ? 'Create new report' : 'Edit report'}
          </SheetTitle>
          <div className='flex w-full items-center gap-4'>
            <SheetDescription>
              {mode === ReportFormMode.CREATE
                ? 'Fill in the details to create a new Google Sheets report'
                : 'Update details of an existing Google Sheets report'}
            </SheetDescription>
            {reportLink && <CopyLinkButton link={reportLink} ariaLabel='Copy link to this report' />}
          </div>
        </SheetHeader>

        <DataDestinationProvider>
          <GoogleSheetsReportEditForm
            initialReport={initialReport}
            mode={mode}
            onDirtyChange={handleFormDirtyChange}
            onSubmit={() => {
              void onSubmitSuccess?.();
              handleFormSubmitSuccess();
            }}
            onCancel={handleClose}
            preSelectedDestination={preSelectedDestination}
          />
        </DataDestinationProvider>
        <UnsavedChangesConfirmationDialog
          open={showUnsavedDialog}
          onOpenChange={setShowUnsavedDialog}
          onConfirm={confirmClose}
        />
      </SheetContent>
    </Sheet>
  );
}

import { DataDestinationType } from '../../../../../data-destination/shared/enums';
import { ReportEditSheet } from '../../../edit/components/ReportEditSheet';
import { LookerStudioReportEditSheet } from '../../../edit/components/LookerStudioReportEditSheet';
import { EmailReportEditSheet } from '../../../edit/components/EmailReportEditSheet';
import { ReportFormMode } from '../../../shared';
import type { DataDestination } from '../../../../../data-destination/shared/model/types';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';

interface ReportEditSheetRendererProps {
  destination: DataDestination;
  isOpen: boolean;
  onClose: () => void;
  onSubmitSuccess?: () => void | Promise<void>;
  mode: ReportFormMode;
  initialReport?: DataMartReport | null;
}

/**
 * Renders the appropriate edit sheet based on destination type
 * Handles both CREATE and EDIT modes
 */
export function ReportEditSheetRenderer({
  destination,
  isOpen,
  onClose,
  onSubmitSuccess,
  mode,
  initialReport,
}: ReportEditSheetRendererProps) {
  // Excel reports are configured exactly like Google Sheets ones — same output controls, same
  // data mart. The sheet asks for nothing destination-specific, so it serves both.
  switch (destination.type) {
    case DataDestinationType.GOOGLE_SHEETS:
    case DataDestinationType.EXCEL:
      return (
        <ReportEditSheet
          isOpen={isOpen}
          onClose={onClose}
          onSubmitSuccess={onSubmitSuccess}
          mode={mode}
          preSelectedDestination={destination}
          initialReport={initialReport ?? undefined}
        />
      );
    case DataDestinationType.LOOKER_STUDIO:
      return (
        <LookerStudioReportEditSheet
          isOpen={isOpen}
          onClose={onClose}
          onSubmitSuccess={onSubmitSuccess}
          mode={mode}
          preSelectedDestination={destination}
          initialReport={initialReport ?? undefined}
        />
      );
    case DataDestinationType.EMAIL:
    case DataDestinationType.SLACK:
    case DataDestinationType.GOOGLE_CHAT:
    case DataDestinationType.MS_TEAMS:
      return (
        <EmailReportEditSheet
          isOpen={isOpen}
          onClose={onClose}
          onSubmitSuccess={onSubmitSuccess}
          mode={mode}
          preSelectedDestination={destination}
          initialReport={initialReport ?? undefined}
        />
      );
    default:
      return null;
  }
}

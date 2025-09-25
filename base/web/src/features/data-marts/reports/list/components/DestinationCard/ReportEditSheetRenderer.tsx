import { DataDestinationType } from '../../../../../data-destination/shared/enums';
import { GoogleSheetsReportEditSheet } from '../../../edit/components/GoogleSheetsReportEditSheet';
import { LookerStudioReportEditSheet } from '../../../edit/components/LookerStudioReportEditSheet';
import { ReportFormMode } from '../../../shared';
import type { DataDestination } from '../../../../../data-destination/shared/model/types';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';

interface ReportEditSheetRendererProps {
  destination: DataDestination;
  isOpen: boolean;
  onClose: () => void;
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
  mode,
  initialReport,
}: ReportEditSheetRendererProps) {
  switch (destination.type) {
    case DataDestinationType.GOOGLE_SHEETS:
      return (
        <GoogleSheetsReportEditSheet
          isOpen={isOpen}
          onClose={onClose}
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
          mode={mode}
          preSelectedDestination={destination}
          initialReport={initialReport ?? undefined}
        />
      );
    default:
      return null;
  }
}

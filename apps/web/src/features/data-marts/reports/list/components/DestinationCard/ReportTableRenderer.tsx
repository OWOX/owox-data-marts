import { DataDestinationType } from '../../../../../data-destination/shared/enums';
import { GoogleSheetsReportsTable } from '../../../list/components/GoogleSheetsReportsTable/GoogleSheetsReportsTable';
import { LookerStudioReportCard } from '../../../list/components/LookerStudioReportCard/LookerStudioReportCard';
import type { DataDestination } from '../../../../../data-destination/shared/model/types';
import type { DataMartStatusInfo } from '../../../../shared/types/data-mart-status.model';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';

interface ReportTableRendererProps {
  destination: DataDestination;
  dataMartStatus?: DataMartStatusInfo;
  onEditReport: (report: DataMartReport) => void;
}

/**
 * ReportTableRenderer
 * - Decides which report table/card to display based on the destination type
 * - Delegates rendering to the appropriate child component
 * - Forwards the onEditReport handler so child components can open the modal
 */
export function ReportTableRenderer({
  destination,
  dataMartStatus,
  onEditReport,
}: ReportTableRendererProps) {
  switch (destination.type) {
    case DataDestinationType.GOOGLE_SHEETS:
      // Render table with reports for Google Sheets destination
      return <GoogleSheetsReportsTable destination={destination} onEditReport={onEditReport} />;

    case DataDestinationType.LOOKER_STUDIO:
      // Render single card for Looker Studio destination
      return (
        <LookerStudioReportCard
          destination={destination}
          dataMartStatus={dataMartStatus}
          onEditReport={onEditReport}
        />
      );

    default:
      // Unsupported or unknown destination type
      return null;
  }
}

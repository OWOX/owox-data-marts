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
 * Renders the appropriate table/card based on destination type
 */
export function ReportTableRenderer({
  destination,
  dataMartStatus,
  onEditReport,
}: ReportTableRendererProps) {
  switch (destination.type) {
    case DataDestinationType.GOOGLE_SHEETS:
      return <GoogleSheetsReportsTable destination={destination} onEditReport={onEditReport} />;
    case DataDestinationType.LOOKER_STUDIO:
      return (
        <LookerStudioReportCard
          destination={destination}
          dataMartStatus={dataMartStatus}
          onEditReport={onEditReport}
        />
      );
    default:
      return null;
  }
}

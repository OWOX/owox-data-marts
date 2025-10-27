import { DataDestinationType } from '../../../../../data-destination';
import { GoogleSheetsReportsTable } from '../GoogleSheetsReportsTable';
import { LookerStudioReportCard } from '../LookerStudioReportCard';
import type { DataDestination } from '../../../../../data-destination';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';

interface ReportListRendererProps {
  destination: DataDestination;
  onEditReport: (report: DataMartReport) => void;
  autoRefreshEnabled?: boolean;
}

export function ReportListRenderer({
  destination,
  onEditReport,
  autoRefreshEnabled,
}: ReportListRendererProps) {
  switch (destination.type) {
    case DataDestinationType.GOOGLE_SHEETS:
      return (
        <GoogleSheetsReportsTable
          destination={destination}
          onEditReport={onEditReport}
          autoRefreshEnabled={autoRefreshEnabled}
        />
      );

    case DataDestinationType.LOOKER_STUDIO:
      return <LookerStudioReportCard destination={destination} onEditReport={onEditReport} />;

    default: {
      return null;
    }
  }
}

import { DataDestinationType } from '../../../../../data-destination';
import { GoogleSheetsReportsTable } from '../GoogleSheetsReportsTable';
import { EmailReportsTable } from '../EmailReportsTable';
import { LookerStudioReportCard } from '../LookerStudioReportCard';
import type { DataDestination } from '../../../../../data-destination';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import type { DataMartStatusInfo } from '../../../../shared/types/data-mart-status.model';

interface ReportListRendererProps {
  destination: DataDestination;
  onEditReport: (report: DataMartReport) => void;
  dataMartStatus?: DataMartStatusInfo;
  onAddReport: () => void;
}

export function ReportListRenderer({
  destination,
  onEditReport,
  dataMartStatus,
  onAddReport,
}: ReportListRendererProps) {
  switch (destination.type) {
    case DataDestinationType.GOOGLE_SHEETS:
      return (
        <GoogleSheetsReportsTable
          destination={destination}
          onEditReport={onEditReport}
          dataMartStatus={dataMartStatus}
          onAddReport={onAddReport}
        />
      );

    case DataDestinationType.EMAIL:
    case DataDestinationType.SLACK:
    case DataDestinationType.GOOGLE_CHAT:
    case DataDestinationType.MS_TEAMS:
      return (
        <EmailReportsTable
          destinationType={destination.type}
          destination={destination}
          onEditReport={onEditReport}
          dataMartStatus={dataMartStatus}
          onAddReport={onAddReport}
        />
      );

    case DataDestinationType.LOOKER_STUDIO:
      return (
        <LookerStudioReportCard
          data-testid='reportCard'
          destination={destination}
          onEditReport={onEditReport}
        />
      );

    default: {
      return null;
    }
  }
}

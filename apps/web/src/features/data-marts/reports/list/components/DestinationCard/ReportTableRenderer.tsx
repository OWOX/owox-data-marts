import { DataDestinationType } from '../../../../../data-destination/shared/enums';
import { GoogleSheetsReportsTable } from '../../../list/components/GoogleSheetsReportsTable/GoogleSheetsReportsTable';
import { LookerStudioReportCard } from '../../../list/components/LookerStudioReportCard/LookerStudioReportCard';
import type { DataDestination } from '../../../../../data-destination/shared/model/types';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';

interface ReportTableRendererProps {
  destination: DataDestination;
  onEditReport: (report: DataMartReport) => void;
}

/**
 * ReportTableRenderer
 */
export function ReportTableRenderer({ destination, onEditReport }: ReportTableRendererProps) {
  type RendererComponent = React.ComponentType<ReportTableRendererProps>;

  const rendererMap: Partial<Record<DataDestinationType, RendererComponent>> = {
    [DataDestinationType.GOOGLE_SHEETS]: GoogleSheetsReportsTable,
    [DataDestinationType.LOOKER_STUDIO]: LookerStudioReportCard,
  };

  const Renderer = rendererMap[destination.type];
  if (!Renderer) return null;

  return <Renderer destination={destination} onEditReport={onEditReport} />;
}

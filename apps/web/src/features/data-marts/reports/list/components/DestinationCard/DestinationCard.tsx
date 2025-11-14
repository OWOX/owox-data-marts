import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
  CollapsibleCardFooter,
  CollapsibleCardHeaderActions,
} from '../../../../../../shared/components/CollapsibleCard';
import type { DataMartStatusInfo } from '../../../../shared';
import type { DataDestination } from '../../../../../data-destination';
import { useDataDestinationVisibility } from '../../../../../data-destination';
import { useReportSidesheet } from '../../model/hooks';
import { AddReportButton, ReportEditSheetRenderer, ReportListRenderer } from './index';
import { DataDestinationType } from '../../../../../data-destination';

interface DestinationCardProps {
  destination: DataDestination;
  dataMartStatus?: DataMartStatusInfo;
}

const reportDestinationTypes = [
  DataDestinationType.GOOGLE_SHEETS,
  DataDestinationType.EMAIL,
  DataDestinationType.SLACK,
  DataDestinationType.MS_TEAMS,
  DataDestinationType.GOOGLE_CHAT,
];

/**
 * DestinationCard component
 * - Displays a collapsible card for each Data Destination
 * - Allows adding and editing reports via a modal
 * - Renders a report table inside the card
 */
export function DestinationCard({ destination, dataMartStatus }: DestinationCardProps) {
  const { destinationInfo, isVisible } = useDataDestinationVisibility(destination);

  // Modal state and handlers for creating/editing reports
  const { isOpen, mode, editingReport, handleAddReport, handleEditReport, handleCloseModal } =
    useReportSidesheet();

  // Skip rendering if destination is not active
  if (!isVisible) {
    return null;
  }

  return (
    <>
      {/* Collapsible card container for a single destination */}
      <CollapsibleCard name={destination.id} collapsible defaultCollapsed={false}>
        <CollapsibleCardHeader>
          {/* Card title with destination icon */}
          <CollapsibleCardHeaderTitle icon={destinationInfo.icon}>
            {destination.title}
          </CollapsibleCardHeaderTitle>

          {/* Actions */}
          <CollapsibleCardHeaderActions>
            {/* Render AddReportButton only for Google Sheets*/}
            {reportDestinationTypes.includes(destination.type) && (
              <AddReportButton dataMartStatus={dataMartStatus} onAddReport={handleAddReport} />
            )}
          </CollapsibleCardHeaderActions>
        </CollapsibleCardHeader>

        {/* Reports list table */}
        <CollapsibleCardContent>
          <ReportListRenderer
            destination={destination}
            onEditReport={handleEditReport}
            {...(reportDestinationTypes.includes(destination.type) && {
              autoRefreshEnabled: true,
            })}
          />
        </CollapsibleCardContent>

        <CollapsibleCardFooter />
      </CollapsibleCard>

      {/* Single Report Modal (used for both Add and Edit modes) */}
      <ReportEditSheetRenderer
        destination={destination}
        isOpen={isOpen}
        onClose={handleCloseModal}
        mode={mode}
        initialReport={editingReport}
      />
    </>
  );
}

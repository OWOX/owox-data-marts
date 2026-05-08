import { useMemo } from 'react';
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
import { useDataDestination, useDataDestinationVisibility } from '../../../../../data-destination';
import { useReportSidesheet } from '../../model/hooks';
import { AddReportButton, ReportEditSheetRenderer, ReportListRenderer } from './index';
import { DataDestinationType } from '../../../../../data-destination';
import { InviteTeammatesCard } from '../../../../../../shared/components/InviteTeammatesCard';
import { useReport } from '../../../shared';

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
 * Returns stats for a destination: report count and total Google Sheets destinations.
 */
function useDestinationStats(destinationId: string) {
  const { reports } = useReport();
  const { dataDestinations } = useDataDestination();
  return useMemo(
    () => ({
      reportsCount: reports.filter(r => r.dataDestination.id === destinationId).length,
      googleSheetsCount: dataDestinations.filter(d => d.type === DataDestinationType.GOOGLE_SHEETS)
        .length,
    }),
    [reports, dataDestinations, destinationId]
  );
}

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

  // Condition to show InviteTeammatesCard
  const { reportsCount, googleSheetsCount } = useDestinationStats(destination.id);
  const shouldShowInviteCard =
    destination.type === DataDestinationType.GOOGLE_SHEETS &&
    reportsCount === 0 &&
    googleSheetsCount === 1;

  // Skip rendering if destination is not active
  if (!isVisible) {
    return null;
  }

  return (
    <>
      {/* Collapsible card container for a single destination */}
      <div className='flex flex-col gap-0.5' data-testid='destCard'>
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
              dataMartStatus={dataMartStatus}
              onAddReport={handleAddReport}
            />
          </CollapsibleCardContent>

          <CollapsibleCardFooter />
        </CollapsibleCard>
        {shouldShowInviteCard && (
          <InviteTeammatesCard
            hint='— Give business users self-service access to reporting in Google Sheets'
            docsLabel='Learn more about Google Sheets destination'
            docsHref='https://docs.owox.com/docs/destinations/supported-destinations/google-sheets/?utm_source=owox_data_marts&utm_medium=dm_page_destinations_tab&utm_campaign=no_reports_google_sheets_destination'
          />
        )}
      </div>

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

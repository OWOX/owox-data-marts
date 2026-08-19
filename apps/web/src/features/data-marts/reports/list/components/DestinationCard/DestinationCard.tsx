import { useCallback, useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@owox/ui/components/alert-dialog';
import { Button } from '@owox/ui/components/button';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
  CollapsibleCardFooter,
  CollapsibleCardHeaderActions,
} from '../../../../../../shared/components/CollapsibleCard';
import {
  DataMartStatus,
  getRequiredSetupActions,
  type DataMartStatusInfo,
  type DataMartValidationError,
} from '../../../../shared';
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
  canPublish?: boolean;
  validationErrors?: DataMartValidationError[];
  onPublishDataMart?: () => Promise<boolean>;
  onReviewDataSetup?: () => void;
}

const reportDestinationTypes = [
  DataDestinationType.GOOGLE_SHEETS,
  DataDestinationType.EMAIL,
  DataDestinationType.SLACK,
  DataDestinationType.MS_TEAMS,
  DataDestinationType.GOOGLE_CHAT,
];

type ReportCreationDialog = 'publish' | 'setup';

/**
 * Returns the reports that belong to a destination.
 */
function useDestinationReports(destinationId: string) {
  const { reports } = useReport();
  return useMemo(
    () => reports.filter(report => report.dataDestination.id === destinationId),
    [reports, destinationId]
  );
}

/**
 * Returns the total number of Google Sheets destinations in the project.
 */
function useGoogleSheetsDestinationCount() {
  const { dataDestinations } = useDataDestination();
  return useMemo(
    () => dataDestinations.filter(d => d.type === DataDestinationType.GOOGLE_SHEETS).length,
    [dataDestinations]
  );
}

const NO_DEEP_LINK_REPORTS: never[] = [];

/**
 * DestinationCard component
 * - Displays a collapsible card for each Data Destination
 * - Allows adding and editing reports via a modal
 * - Renders a report table inside the card
 */
export function DestinationCard({
  destination,
  dataMartStatus,
  canPublish = false,
  validationErrors = [],
  onPublishDataMart,
  onReviewDataSetup,
}: DestinationCardProps) {
  const { destinationInfo, isVisible } = useDataDestinationVisibility(destination);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState<ReportCreationDialog>('setup');
  const [isPublishing, setIsPublishing] = useState(false);

  // Modal state and handlers for creating/editing reports.
  // Passing the destination reports enables deep linking via the reportId query param;
  // an invisible card never renders its sheet, so it must not consume the param.
  const destinationReports = useDestinationReports(destination.id);
  const { isOpen, mode, editingReport, handleAddReport, handleEditReport, handleCloseModal } =
    useReportSidesheet({ deepLinkReports: isVisible ? destinationReports : NO_DEEP_LINK_REPORTS });

  // Condition to show InviteTeammatesCard
  const reportsCount = destinationReports.length;
  const googleSheetsCount = useGoogleSheetsDestinationCount();
  const shouldShowInviteCard =
    destination.type === DataDestinationType.GOOGLE_SHEETS &&
    reportsCount === 0 &&
    googleSheetsCount === 1;

  const isDraft = dataMartStatus?.code === DataMartStatus.DRAFT;
  const requiredSetupActions = getRequiredSetupActions(validationErrors);

  const handleAddReportRequest = useCallback(() => {
    if (!isDraft) {
      handleAddReport();
      return;
    }

    setDialogContent(canPublish ? 'publish' : 'setup');
    setIsDialogOpen(true);
  }, [canPublish, handleAddReport, isDraft]);

  const handlePublishAndCreateReport = useCallback(async () => {
    if (!onPublishDataMart) return;

    setIsPublishing(true);
    const published = await onPublishDataMart().catch(() => false);
    setIsPublishing(false);
    setIsDialogOpen(false);

    if (published) {
      handleAddReport();
    }
  }, [handleAddReport, onPublishDataMart]);

  const handleReviewDataSetup = useCallback(() => {
    setIsDialogOpen(false);
    onReviewDataSetup?.();
  }, [onReviewDataSetup]);

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
                <AddReportButton onAddReport={handleAddReportRequest} />
              )}
            </CollapsibleCardHeaderActions>
          </CollapsibleCardHeader>

          {/* Reports list table */}
          <CollapsibleCardContent>
            <ReportListRenderer
              destination={destination}
              onEditReport={handleEditReport}
              onAddReport={handleAddReportRequest}
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

      <AlertDialog
        open={isDialogOpen}
        onOpenChange={open => {
          if (!open && !isPublishing) setIsDialogOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialogContent === 'publish'
                ? 'Publish Data Mart to create a report?'
                : 'Complete Data Mart setup first'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dialogContent === 'publish'
                ? 'Reports are available only for published Data Marts. We’ll open the new report form when publishing is complete.'
                : requiredSetupActions.length === 1
                  ? `Before creating a report, ${requiredSetupActions[0]}.`
                  : 'Before creating a report the required setup is needed:'}
            </AlertDialogDescription>
            {dialogContent === 'setup' && requiredSetupActions.length > 1 && (
              <ul className='text-muted-foreground list-disc space-y-0.5 pl-5 text-sm'>
                {requiredSetupActions.map(action => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            )}
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPublishing}>Cancel</AlertDialogCancel>
            {dialogContent === 'publish' ? (
              <Button onClick={() => void handlePublishAndCreateReport()} disabled={isPublishing}>
                {isPublishing ? 'Publishing…' : 'Publish and create report'}
              </Button>
            ) : (
              <Button onClick={handleReviewDataSetup}>Open Data Setup</Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

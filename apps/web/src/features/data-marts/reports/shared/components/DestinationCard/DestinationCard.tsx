import { useState } from 'react';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
  CollapsibleCardFooter,
  CollapsibleCardHeaderActions,
} from '../../../../../../shared/components/CollapsibleCard';
import { DataDestinationTypeModel } from '../../../../../data-destination/shared/types';
import {
  DataDestinationType,
  DataDestinationStatus,
} from '../../../../../data-destination/shared/enums';
import type { DataDestinationResponseDto } from '../../../../../data-destination/shared/services/types';
import type { DataMartReport } from '../../model/types/data-mart-report';
import { GoogleSheetsReportsTable } from '../../../list/components/GoogleSheetsReportsTable/GoogleSheetsReportsTable';
import { LookerStudioReportCard } from '../../../list/components/LookerStudioReportCard/LookerStudioReportCard';
import { GoogleSheetsReportEditSheet } from '../../../edit/components/GoogleSheetsReportEditSheet';
import { LookerStudioReportEditSheet } from '../../../edit/components/LookerStudioReportEditSheet';
import { ReportFormMode } from '../../../shared';
import { Button } from '../../../../../../shared/components/Button';
import { PlusIcon } from 'lucide-react';
import type { DataMartStatusInfo } from '../../../../shared/types/data-mart-status.model';
import { DataMartStatus } from '../../../../shared/enums/data-mart-status.enum';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';

interface DestinationCardProps {
  destination: DataDestinationResponseDto;
  dataMartStatus?: DataMartStatusInfo;
}

export function DestinationCard({ destination, dataMartStatus }: DestinationCardProps) {
  const destinationInfo = DataDestinationTypeModel.getInfo(destination.type);
  const [isAddReportOpen, setIsAddReportOpen] = useState(false);
  const [isEditReportOpen, setIsEditReportOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<DataMartReport | null>(null);

  // Only show destinations that are active
  if (destinationInfo.status !== DataDestinationStatus.ACTIVE) {
    return null;
  }

  const handleAddReport = () => {
    setIsAddReportOpen(true);
  };

  const handleEditReport = (report: DataMartReport) => {
    setEditingReport(report);
    setIsEditReportOpen(true);
  };

  const handleCloseAddReport = () => {
    setIsAddReportOpen(false);
  };

  const handleCloseEditReport = () => {
    setIsEditReportOpen(false);
    setEditingReport(null);
  };

  // Determine which edit sheet to show based on destination type
  const renderAddReportSheet = () => {
    if (destination.type === DataDestinationType.GOOGLE_SHEETS) {
      return (
        <GoogleSheetsReportEditSheet
          isOpen={isAddReportOpen}
          onClose={handleCloseAddReport}
          mode={ReportFormMode.CREATE}
          preSelectedDestination={destination}
        />
      );
    } else if (destination.type === DataDestinationType.LOOKER_STUDIO) {
      return (
        <LookerStudioReportEditSheet
          isOpen={isAddReportOpen}
          onClose={handleCloseAddReport}
          mode={ReportFormMode.CREATE}
          preSelectedDestination={destination}
        />
      );
    }
    return null;
  };

  const renderEditReportSheet = () => {
    if (!editingReport) return null;

    if (destination.type === DataDestinationType.GOOGLE_SHEETS) {
      return (
        <GoogleSheetsReportEditSheet
          isOpen={isEditReportOpen}
          onClose={handleCloseEditReport}
          initialReport={editingReport}
          mode={ReportFormMode.EDIT}
        />
      );
    } else if (destination.type === DataDestinationType.LOOKER_STUDIO) {
      return (
        <LookerStudioReportEditSheet
          isOpen={isEditReportOpen}
          onClose={handleCloseEditReport}
          initialReport={editingReport}
          mode={ReportFormMode.EDIT}
        />
      );
    }
    return null;
  };

  // Render the appropriate table based on destination type
  const renderDestinationTable = () => {
    if (destination.type === DataDestinationType.GOOGLE_SHEETS) {
      return <GoogleSheetsReportsTable destination={destination} onEditReport={handleEditReport} />;
    } else if (destination.type === DataDestinationType.LOOKER_STUDIO) {
      return (
        <LookerStudioReportCard
          destination={destination}
          dataMartStatus={dataMartStatus}
          onEditReport={handleEditReport}
        />
      );
    }
    return null;
  };

  return (
    <>
      <CollapsibleCard name={destination.id} collapsible defaultCollapsed={false}>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={destinationInfo.icon}
            tooltip={`List of reports to ${destinationInfo.displayName}`}
          >
            {destination.title}
          </CollapsibleCardHeaderTitle>
          <CollapsibleCardHeaderActions>
            {destination.type === DataDestinationType.GOOGLE_SHEETS && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      onClick={handleAddReport}
                      variant='outline'
                      size='sm'
                      aria-label='Add new Google Sheets report'
                      disabled={dataMartStatus?.code === DataMartStatus.DRAFT}
                    >
                      <PlusIcon className='h-4 w-4' />
                      Add Report
                    </Button>
                  </span>
                </TooltipTrigger>
                {dataMartStatus?.code === DataMartStatus.DRAFT && (
                  <TooltipContent>
                    <p>To create a report, publish the Data Mart first</p>
                  </TooltipContent>
                )}
              </Tooltip>
            )}
          </CollapsibleCardHeaderActions>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>{renderDestinationTable()}</CollapsibleCardContent>
        <CollapsibleCardFooter></CollapsibleCardFooter>
      </CollapsibleCard>

      {renderAddReportSheet()}
      {renderEditReportSheet()}
    </>
  );
}

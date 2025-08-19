import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
  CollapsibleCardFooter,
  CollapsibleCardHeaderActions,
} from '../../../../../../shared/components/CollapsibleCard';
import { ReportFormMode } from '../../../shared';
import type { DataMartStatusInfo } from '../../../../shared/types/data-mart-status.model';
import type { DataDestination } from '../../../../../data-destination/shared/model/types';
import { useReportModals, useDestinationValidation } from '../../model/hooks';
import { AddReportButton } from './AddReportButton';
import { ReportEditSheetRenderer } from './ReportEditSheetRenderer';
import { ReportTableRenderer } from './ReportTableRenderer';

interface DestinationCardProps {
  destination: DataDestination;
  dataMartStatus?: DataMartStatusInfo;
}

export function DestinationCard({ destination, dataMartStatus }: DestinationCardProps) {
  const { destinationInfo, isVisible } = useDestinationValidation(destination);
  const {
    isAddReportOpen,
    isEditReportOpen,
    editingReport,
    handleAddReport,
    handleEditReport,
    handleCloseAddReport,
    handleCloseEditReport,
  } = useReportModals();

  // Only show destinations that are active
  if (!isVisible) {
    return null;
  }

  return (
    <>
      <CollapsibleCard name={destination.id} collapsible defaultCollapsed={false}>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle icon={destinationInfo.icon}>
            {destination.title}
          </CollapsibleCardHeaderTitle>
          <CollapsibleCardHeaderActions>
            <AddReportButton
              destinationType={destination.type}
              dataMartStatus={dataMartStatus}
              onAddReport={handleAddReport}
            />
          </CollapsibleCardHeaderActions>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <ReportTableRenderer
            destination={destination}
            dataMartStatus={dataMartStatus}
            onEditReport={handleEditReport}
          />
        </CollapsibleCardContent>
        <CollapsibleCardFooter></CollapsibleCardFooter>
      </CollapsibleCard>

      {/* Add Report Sheet */}
      <ReportEditSheetRenderer
        destination={destination}
        isOpen={isAddReportOpen}
        onClose={handleCloseAddReport}
        mode={ReportFormMode.CREATE}
      />

      {/* Edit Report Sheet */}
      <ReportEditSheetRenderer
        destination={destination}
        isOpen={isEditReportOpen}
        onClose={handleCloseEditReport}
        mode={ReportFormMode.EDIT}
        initialReport={editingReport}
      />
    </>
  );
}

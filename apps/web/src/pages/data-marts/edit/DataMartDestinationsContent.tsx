import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
  CollapsibleCardFooter,
} from '../../../shared/components/CollapsibleCard';
import { GoogleSheetsIcon, LookerStudioIcon } from '../../../shared';
import { ReportsProvider } from '../../../features/data-marts/reports/shared';
import {
  GoogleSheetsReportsTable,
  LookerStudioReportsTable,
} from '../../../features/data-marts/reports/list';
import {
  DataDestinationStatus,
  DataDestinationType,
  DataDestinationTypeModel,
} from '../../../features/data-destination';

export default function DataMartDestinationsContent() {
  return (
    <div className='flex flex-col gap-4'>
      <ReportsProvider>
        <CollapsibleCard name='googlesheets' collapsible defaultCollapsed={false}>
          <CollapsibleCardHeader>
            <CollapsibleCardHeaderTitle
              icon={GoogleSheetsIcon}
              tooltip='List of report exports to Google Sheets'
            >
              Google Sheets
            </CollapsibleCardHeaderTitle>
          </CollapsibleCardHeader>
          <CollapsibleCardContent>
            <GoogleSheetsReportsTable></GoogleSheetsReportsTable>
          </CollapsibleCardContent>
          <CollapsibleCardFooter></CollapsibleCardFooter>
        </CollapsibleCard>

        {DataDestinationTypeModel.getInfo(DataDestinationType.LOOKER_STUDIO).status ===
          DataDestinationStatus.ACTIVE && (
          <CollapsibleCard name='lookerstudio' collapsible defaultCollapsed={false}>
            <CollapsibleCardHeader>
              <CollapsibleCardHeaderTitle
                icon={LookerStudioIcon}
                tooltip='Looker Studio Destinations that make this Data Mart available as a data source in Looker Studio connector'
              >
                Looker Studio
              </CollapsibleCardHeaderTitle>
            </CollapsibleCardHeader>
            <CollapsibleCardContent>
              <LookerStudioReportsTable></LookerStudioReportsTable>
            </CollapsibleCardContent>
            <CollapsibleCardFooter></CollapsibleCardFooter>
          </CollapsibleCard>
        )}
      </ReportsProvider>
    </div>
  );
}

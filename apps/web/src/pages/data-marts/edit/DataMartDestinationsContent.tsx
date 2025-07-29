import { CollapsibleCard } from '../../../shared/components/CollapsibleCard';
import { CollapsibleCardHeader } from '../../../shared/components/CollapsibleCard/CollapsibleCardHeader';
import { CollapsibleCardContent } from '../../../shared/components/CollapsibleCard/CollapsibleCardContent';
import { CollapsibleCardFooter } from '../../../shared/components/CollapsibleCard/CollapsibleCardFooter';
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
          <CollapsibleCardHeader
            icon={GoogleSheetsIcon}
            title='Google Sheets'
            help='List of report exports to Google Sheets'
          />
          <CollapsibleCardContent>
            <GoogleSheetsReportsTable></GoogleSheetsReportsTable>
          </CollapsibleCardContent>
          <CollapsibleCardFooter></CollapsibleCardFooter>
        </CollapsibleCard>

        {DataDestinationTypeModel.getInfo(DataDestinationType.LOOKER_STUDIO).status ===
          DataDestinationStatus.ACTIVE && (
          <CollapsibleCard name='lookerstudio' collapsible defaultCollapsed={false}>
            <CollapsibleCardHeader
              icon={LookerStudioIcon}
              title='Looker Studio'
              help='Looker Studio Destinations that make this Data Mart available as a data source in Looker Studio connector'
            />
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

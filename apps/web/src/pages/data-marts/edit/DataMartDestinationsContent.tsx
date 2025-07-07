import { CollapsibleCard } from '../../../shared/components/CollapsibleCard';
import { CollapsibleCardHeader } from '../../../shared/components/CollapsibleCard/CollapsibleCardHeader';
import { CollapsibleCardContent } from '../../../shared/components/CollapsibleCard/CollapsibleCardContent';
import { GoogleSheetsIcon } from '../../../shared';
import { ReportsProvider } from '../../../features/data-marts/reports/shared';
import { GoogleSheetsReportsTable } from '../../../features/data-marts/reports/list';

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
        </CollapsibleCard>
      </ReportsProvider>
    </div>
  );
}

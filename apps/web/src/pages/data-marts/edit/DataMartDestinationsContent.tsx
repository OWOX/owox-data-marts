// import { useDataMartContext } from '../../../features/data-marts/edit/model';

import { CollapsibleCard } from '../../../shared/components/CollapsibleCard';
import { CollapsibleCardHeader } from '../../../shared/components/CollapsibleCard/CollapsibleCardHeader';
import { CollapsibleCardContent } from '../../../shared/components/CollapsibleCard/CollapsibleCardContent';
import { GoogleSheetsIcon } from '../../../shared/icons';
import { GoogleSheetsReportsTable } from '../../../features/data-marts/destinations/google-sheets/list/components/GoogleSheetsReportsTable';
import { GoogleSheetsReportsProvider } from '../../../features/data-marts/destinations/google-sheets/shared/model/context';

export default function DataMartDestinationsContent() {
  return (
    <>
      <CollapsibleCard name='googlesheets' collapsible defaultCollapsed={false}>
        <CollapsibleCardHeader
          icon={GoogleSheetsIcon}
          title='Google Sheets'
          help='List of report exports to Google Sheets'
        />
        <CollapsibleCardContent>
          <GoogleSheetsReportsProvider>
            <GoogleSheetsReportsTable />
          </GoogleSheetsReportsProvider>
        </CollapsibleCardContent>
      </CollapsibleCard>
    </>
  );
}

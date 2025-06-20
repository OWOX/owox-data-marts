// import { useDataMartContext } from '../../../features/data-marts/edit/model';

import { columns } from '../../../features/data-marts/destinations/google-sheets/list/components/ReportsTable/columns';
import type { Reports } from '../../../features/data-marts/destinations/google-sheets/list/components/ReportsTable/columns';
import { ReportsTable } from '../../../features/data-marts/destinations/google-sheets/list/components/ReportsTable';

import { CollapsibleCard } from '../../../shared/components/CollapsibleCard';
import { CollapsibleCardHeader } from '../../../shared/components/CollapsibleCard/CollapsibleCardHeader';
import { CollapsibleCardContent } from '../../../shared/components/CollapsibleCard/CollapsibleCardContent';
import { CollapsibleCardFooter } from '../../../shared/components/CollapsibleCard/CollapsibleCardFooter';
import { StatusLabel } from '../../../shared/components/StatusLabel';
import { GoogleSheetsIcon } from '../../../shared/icons';
import { useEffect, useState } from 'react';

export default function DataMartDestinationsContent() {
  // State for mock data
  const [data, setData] = useState<Reports[]>([]);

  useEffect(() => {
    // Imitate async data fetching
    function getData(): Promise<Reports[]> {
      // Mock data for demonstration. Replace with API call when available.
      return Promise.resolve([
        {
          id: '728ed52f',
          destinationAccess: 'abc@email.com',
          documentTitle: 'Document 1',
          sheetTitle: 'Sheet 1',
          lastRunDate: '2025-06-20',
          status: 'success',
          runs: 100,
        },
        {
          id: '728ed52g',
          destinationAccess: 'def@email.com',
          documentTitle: 'Document 2',
          sheetTitle: 'Sheet 2',
          lastRunDate: '2025-06-21',
          status: 'processing',
          runs: 50,
        },
        {
          id: '728ed52h',
          destinationAccess: 'ghi@email.com',
          documentTitle: 'Document 3',
          sheetTitle: 'Sheet 3',
          lastRunDate: '2025-06-22',
          status: 'failed',
          runs: 0,
        },
      ]);
    }
    void getData().then(setData);
  }, []);

  return (
    <>
      {/* 
			<Card>
				<CardHeader>
					<CardTitle>Destinations</CardTitle>
					<CardDescription>{dataMart?.title}</CardDescription>
				</CardHeader>
				<CardContent>👋 Available on the Enterprise plan</CardContent>
			</Card>
			*/}

      <CollapsibleCard name='googlesheets' collapsible defaultCollapsed={false}>
        <CollapsibleCardHeader
          icon={GoogleSheetsIcon}
          title='Google Sheets'
          help='List of report exports to Google Sheets'
        />
        <CollapsibleCardContent>
          <ReportsTable columns={columns} data={data} />
        </CollapsibleCardContent>
        <CollapsibleCardFooter
          left={
            <StatusLabel variant='ghost' showIcon={false}>
              Total Reports: 3
            </StatusLabel>
          }
          right={
            <StatusLabel variant='ghost' showIcon={false}>
              Last updated: 17.06.2025
            </StatusLabel>
          }
        />
      </CollapsibleCard>
    </>
  );
}

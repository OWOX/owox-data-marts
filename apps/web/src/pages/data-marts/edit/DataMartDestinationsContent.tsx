import { CollapsibleCard } from '../../../shared/components/CollapsibleCard';
import { CollapsibleCardHeader } from '../../../shared/components/CollapsibleCard/CollapsibleCardHeader';
import { CollapsibleCardContent } from '../../../shared/components/CollapsibleCard/CollapsibleCardContent';
import { GoogleSheetsIcon, LookerStudioIcon, ODataIcon } from '../../../shared';
import { ReportsProvider } from '../../../features/data-marts/reports/shared';
import { GoogleSheetsReportsTable } from '../../../features/data-marts/reports/list';
import { CollapsibleCardFooter } from '../../../shared/components/CollapsibleCard/CollapsibleCardFooter';
import { CollapsibleCardActions } from '../../../shared/components/CollapsibleCard/CollapsibleCardActions';
import { Button } from '@owox/ui/components/button';

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

        <CollapsibleCard name='lookerstudio' collapsible defaultCollapsed={true}>
          <CollapsibleCardHeader
            icon={LookerStudioIcon}
            title='Looker Studio'
            subtitle='Coming soon'
            help='List of report exports to Looker Studio'
          />
          <CollapsibleCardContent>
            <div className='text-muted-foreground flex w-full flex-col gap-2 rounded-md border-0 border-b border-gray-200 bg-white p-4 dark:border-0 dark:bg-white/5'>
              <p>
                We're planning to add an option to send data from your Data Marts directly to{' '}
                <a
                  href='https://lookerstudio.google.com/overview'
                  target='_blank'
                  rel='noopener,noreferrer'
                  className='font-semibold'
                >
                  Looker Studio
                </a>{' '}
                — so you can build reports and dashboards without extra steps.
              </p>
              <p>
                Would this feature be helpful for you? Let us know in the GitHub discussion. Your
                feedback will help us understand what to prioritize.
              </p>
            </div>
          </CollapsibleCardContent>
          <CollapsibleCardFooter
            left={
              <CollapsibleCardActions>
                <Button
                  variant='outline'
                  onClick={() =>
                    window.open(
                      'https://github.com/OWOX/owox-data-marts/discussions',
                      '_blank',
                      'noopener,noreferrer'
                    )
                  }
                >
                  Go to GitHub discussion
                </Button>
              </CollapsibleCardActions>
            }
          />
        </CollapsibleCard>

        <CollapsibleCard name='odata' collapsible defaultCollapsed={true}>
          <CollapsibleCardHeader
            icon={ODataIcon}
            title='OData'
            subtitle='Coming soon'
            help='List of report exports to OData'
          />
          <CollapsibleCardContent>
            <div className='text-muted-foreground flex w-full flex-col gap-2 rounded-md border-0 border-b border-gray-200 bg-white p-4 dark:border-0 dark:bg-white/5'>
              <p>
                We're also considering support for{' '}
                <a
                  href='https://www.odata.org/'
                  target='_blank'
                  rel='noopener,noreferrer'
                  className='font-semibold'
                >
                  OData
                </a>{' '}
                — allowing you to connect your Data Marts to Power BI, Tableau, Qlik, and other BI
                tools that support this protocol.
              </p>
              <p>
                Share your thoughts in the GitHub discussion. We're listening and your input really
                matters.
              </p>
            </div>
          </CollapsibleCardContent>
          <CollapsibleCardFooter
            left={
              <CollapsibleCardActions>
                <Button
                  variant='outline'
                  onClick={() =>
                    window.open(
                      'https://github.com/OWOX/owox-data-marts/discussions',
                      '_blank',
                      'noopener,noreferrer'
                    )
                  }
                >
                  Go to GitHub discussion
                </Button>
              </CollapsibleCardActions>
            }
          />
        </CollapsibleCard>
      </ReportsProvider>
    </div>
  );
}

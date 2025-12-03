import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with step-by-step instructions for Snowflake Account.
 */
export default function SnowflakeAccountDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='snowflake-account-details'>
        <AccordionTrigger>How do I find my Snowflake account identifier?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            To find the region and locator for your account, see{' '}
            <ExternalAnchor
              className='underline'
              href='https://docs.snowflake.com/en/user-guide/admin-account-identifier#finding-the-region-and-locator-for-an-account'
            >
              Snowflake documentation
            </ExternalAnchor>
            .
          </p>
          <ol className='list-inside list-decimal space-y-3 text-sm'>
            <li>
              Open the account selector and review the list of accounts that you previously signed
              in to.
            </li>
            <li>
              Select <strong>View account details</strong>.
            </li>
            <li>
              The <strong>Account Details</strong> dialog displays information about the account,
              including the account identifier and the account URL.
            </li>
            <li>
              Copy part of your account identifier from the <strong>Account locator</strong> field.
            </li>
            <li>Find the region in the account selector (e.g. Europe West4 (Netherlands)).</li>
            <li>
              Compare the found region with the <strong>Account Identifier Region</strong> in{' '}
              <ExternalAnchor
                className='underline'
                href='https://docs.snowflake.com/en/user-guide/admin-account-identifier#non-vps-account-locator-formats-by-cloud-platform-and-region'
              >
                Snowflake documentation
              </ExternalAnchor>{' '}
              for locator formats by cloud platform and region.
            </li>
            <li>
              Create the account identifier by combining the locator and the region like this:{' '}
              <code className='bg-muted rounded px-1 py-0.5'>locator.region</code>
              <div className='mt-2'>
                Examples:
                <ul className='mt-1 ml-4 space-y-1'>
                  <li>
                    <code className='bg-muted rounded px-1 py-0.5'>xy12345.ap-northeast-3.aws</code>
                  </li>
                  <li>
                    <code className='bg-muted rounded px-1 py-0.5'>xy12345.north-europe.azure</code>
                  </li>
                </ul>
              </div>
            </li>
          </ol>
          <div className='mt-4 text-sm'>
            More details in{' '}
            <ExternalAnchor
              className='underline'
              href='https://docs.owox.com/docs/storages/supported-storages/snowflake/'
            >
              OWOX Snowflake documentation
            </ExternalAnchor>
            .
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

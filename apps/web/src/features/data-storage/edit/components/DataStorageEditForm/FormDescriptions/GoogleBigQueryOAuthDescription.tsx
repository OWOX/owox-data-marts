import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';

/**
 * Accordion with details about Google OAuth permissions requested for BigQuery access.
 */
export default function GoogleBigQueryOAuthDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='oauth-details'>
        <AccordionTrigger>What permissions will be requested?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            When you connect with Google, OWOX will request the following permissions:
          </p>
          <ul className='list-inside list-disc space-y-2 text-sm'>
            <li>
              <strong>BigQuery</strong> — read and write access to datasets and tables used as data
              storage.
            </li>
            <li>
              <strong>Basic profile info</strong> — your name and email to identify the connected
              account.
            </li>
          </ul>
          <p className='mt-2 text-sm'>
            OWOX will only access BigQuery resources that you explicitly configure as storage. You
            can revoke access at any time from your{' '}
            <a
              href='https://myaccount.google.com/permissions'
              target='_blank'
              rel='noopener noreferrer'
              className='underline'
            >
              Google Account settings
            </a>
            .
          </p>
          <p className='mt-2 text-sm'>
            The connected Google account must have the <strong>BigQuery Data Editor</strong> (
            <code>roles/bigquery.dataEditor</code>) and <strong>BigQuery Job User</strong> (
            <code>roles/bigquery.jobUser</code>) roles on the target Google Cloud project. You can
            check or assign them in{' '}
            <a
              href='https://console.cloud.google.com/iam-admin/iam'
              target='_blank'
              rel='noopener noreferrer'
              className='underline'
            >
              IAM & Admin → IAM
            </a>
            . See the{' '}
            <a
              href='https://docs.owox.com/docs/storages/supported-storages/google-bigquery/#option-b-google-oauth'
              target='_blank'
              rel='noopener noreferrer'
              className='underline'
            >
              documentation
            </a>{' '}
            for details.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

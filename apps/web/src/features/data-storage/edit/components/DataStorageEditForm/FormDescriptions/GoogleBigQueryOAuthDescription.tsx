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
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

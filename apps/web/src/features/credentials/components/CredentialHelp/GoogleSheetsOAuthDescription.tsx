import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';

/**
 * Accordion with details about the Google account a Google Sheets Destination connects with.
 */
export default function GoogleSheetsOAuthDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='sheets-oauth-details'>
        <AccordionTrigger>What is this for?</AccordionTrigger>
        <AccordionContent>
          <p className='text-sm'>
            Google Sheets Destinations use this Google account to write reports into spreadsheets.
            Sign in with an account that can edit the target spreadsheets. You can revoke access at
            any time from your{' '}
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

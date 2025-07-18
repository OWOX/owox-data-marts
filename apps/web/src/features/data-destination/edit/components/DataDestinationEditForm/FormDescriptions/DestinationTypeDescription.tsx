import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalLink } from 'lucide-react';

/**
 * Accordion with step-by-step instructions for enabling the Google Sheets API.
 */
export default function DestinationTypeDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='sheets-api-details'>
        <AccordionTrigger>How do I enable the Google Sheets API?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            To send data to Google Sheets, you need to enable the{' '}
            <a
              href='https://console.cloud.google.com/apis/library/sheets.googleapis.com'
              target='_blank'
              rel='noopener noreferrer'
              className='font-medium underline'
            >
              Google Sheets API <ExternalLink className='ml-1 inline h-3 w-3' aria-hidden='true' />
            </a>{' '}
            in your Google Cloud project.
          </p>
          <p className='mb-2'>Here's how to do it:</p>
          <ol className='list-inside list-decimal space-y-2 text-sm'>
            <li>Open the link above and make sure the correct project is selected.</li>
            <li>
              If the API isn't enabled yet, click <strong>Enable</strong>.
            </li>
            <li>If it's already enabled, you'll see the API dashboard — that's fine.</li>
          </ol>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

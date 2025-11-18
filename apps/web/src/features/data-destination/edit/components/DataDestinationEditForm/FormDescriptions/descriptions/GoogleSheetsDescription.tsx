import { AccordionItem, AccordionTrigger, AccordionContent } from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

export default function GoogleSheetsDescription() {
  return (
    <AccordionItem value='sheets-api-details'>
      <AccordionTrigger>How do I enable the Google Sheets API?</AccordionTrigger>
      <AccordionContent>
        <p className='mb-2'>
          To send data to Google Sheets, you need to enable the{' '}
          <ExternalAnchor href='https://console.cloud.google.com/apis/library/sheets.googleapis.com'>
            Google Sheets API
          </ExternalAnchor>{' '}
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
  );
}

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with step-by-step instructions for enabling the Google BigQuery API.
 */
export default function StorageTypeBigQueryDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='bigquery-api-details'>
        <AccordionTrigger>How do I enable the BigQuery API?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            To run queries and process data in Google BigQuery, you need to enable the{' '}
            <ExternalAnchor
              className='underline'
              href='https://console.cloud.google.com/apis/library/bigquery.googleapis.com'
            >
              BigQuery API
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
    </Accordion>
  );
}

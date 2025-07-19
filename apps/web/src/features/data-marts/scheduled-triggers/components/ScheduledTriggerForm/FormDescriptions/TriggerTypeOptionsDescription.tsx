import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { Separator } from '@owox/ui/components/separator';

/**
 * Accordion about trigger type options
 */
export default function TriggerTypeOptionsDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='trigger-type-options-description-details'>
        <AccordionTrigger>How do I choose a type?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            Trigger types define what will be automatically run on a schedule. There are two
            options:
          </p>
          <p className='mb-2'>
            <strong>Report Run</strong> - runs a report to import data from the specified Data
            Storage into a Destination provider (e.g. Google Sheets document).
          </p>
          <p className='mb-2'>
            <strong>Connector Run</strong> - runs a connector (e.g., Facebook Ads) configured in the
            Data Mart to update raw data in the selected Data Storage.
          </p>
          <Separator className='my-4' />
          <p className='mb-2'>
            <strong>Example #1:</strong>
            <br />
            If you have a connector-based Data Mart and want to update a Google Sheets report, set
            up two triggers:
          </p>
          <ol className='list-inside list-decimal space-y-2 text-sm'>
            <li>
              Connector Run - fetches raw data from the data source (e.g., Facebook API) into your
              Data Storage (e.g. Google BigQuery).
            </li>
            <li>
              Report Run - loads the processed data from the same Data Storage (e.g. Google
              BigQuery) into the Google Sheets document.
            </li>
          </ol>
          <Separator className='my-4' />
          <p>
            <strong>Example #2:</strong>
            <br />
            If your Data Mart is based on a SQL query, table, view, or pattern, and you want to
            update a Google Sheets report, use a single Report Run trigger to run the query and send
            the result to the Google Sheets document.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

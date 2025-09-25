import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';

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
            <strong>Report Run</strong> - runs a report to import data from the specified Data
            Storage into a Destination provider (e.g. Google Sheets document).
          </p>
          <p className='mb-2'>
            <strong>Connector Run</strong> - runs a connector (e.g., Facebook Ads) configured in the
            Data Mart to update raw data in the selected Data Storage.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

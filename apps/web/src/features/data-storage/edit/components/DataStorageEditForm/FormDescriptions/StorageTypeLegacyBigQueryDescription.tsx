import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

export default function StorageTypeLegacyBigQueryDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='storage-type-details'>
        <AccordionTrigger>What is this storage type?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            This system storage type is created automatically to maintain compatibility with the{' '}
            <ExternalAnchor
              className='underline'
              href='https://workspace.google.com/marketplace/app/owox_bigquery_data_marts/263000453832'
            >
              OWOX extension
            </ExternalAnchor>{' '}
            for Google Sheets. It cannot be manually added or deleted.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

export default function LegacyGoogleBigQueryTitleDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='title-details'>
        <AccordionTrigger>Why can't I change the title?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>The title is fixed and cannot be changed.</p>
          <p className='mb-2'>
            A separate system storage is created for each GCP project to maintain compatibility with
            the{' '}
            <ExternalAnchor
              className='underline'
              href='https://workspace.google.com/marketplace/app/owox_bigquery_data_marts/263000453832'
            >
              OWOX extension
            </ExternalAnchor>
            for Google Sheets. Its title automatically matches the project ID.
          </p>
          <p className='mb-2'>
            If you need storage for a different project, please contact support.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

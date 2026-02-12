import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

export default function LegacyGoogleBigQueryProjectIdDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='project-id-details'>
        <AccordionTrigger>Why can't I change the project ID?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            This is a system storage created to maintain compatibility with the{' '}
            <ExternalAnchor
              className='underline'
              href='https://workspace.google.com/marketplace/app/owox_bigquery_data_marts/263000453832'
            >
              OWOX BigQuery™ Data Marts
            </ExternalAnchor>
            extension. A separate storage is created for each GCP project, so the project ID cannot
            be changed.
          </p>
          <p className='mb-2'>
            If you don't have storage for the project you need, please contact support.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

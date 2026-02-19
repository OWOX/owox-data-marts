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
          <p className='mb-2'>The project ID is fixed and cannot be changed.</p>
          <p className='mb-2'>
            A separate system storage is created for each GCP project to maintain compatibility with
            the{' '}
            <ExternalAnchor
              className='underline'
              href='https://workspace.google.com/marketplace/app/owox_bigquery_data_marts/263000453832'
            >
              OWOX extension
            </ExternalAnchor>
            for Google Sheets. Its project ID automatically matches the GCP project.
          </p>
          <p className='mb-2'>
            If you need storage for a different project, please contact support.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

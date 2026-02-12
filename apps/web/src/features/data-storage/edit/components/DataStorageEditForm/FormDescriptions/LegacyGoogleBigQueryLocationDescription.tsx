import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with step-by-step instructions for GBQ Location.
 */
export default function LegacyGoogleBigQueryLocationDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='gbq-location-details'>
        <AccordionTrigger>How do I find my dataset location?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            By default, <strong>Auto-detect location</strong> is selected for these storages. We
            will do our best to ensure everything works correctly, but selecting a specific location
            can improve stability.
          </p>
          <p className='mb-2'>
            BigQuery data is stored in specific regions. To avoid query errors, your SQL queries
            must process data stored in the same location.
          </p>
          <p className='mb-2'>Here's how to check your dataset location:</p>
          <ol className='list-inside list-decimal space-y-2 text-sm'>
            <li>
              Open{' '}
              <ExternalAnchor
                className='underline'
                href='https://console.cloud.google.com/bigquery'
              >
                Google Cloud Console BigQuery page
              </ExternalAnchor>
              .
            </li>
            <li>In the left panel, expand your project and find your datasets.</li>
            <li>
              Click each dataset name to open its details. The <strong>Data location</strong> field
              shows the region where that dataset is stored (for example,{' '}
              <code className='text-sm font-semibold'>US</code>,{' '}
              <code className='text-sm font-semibold'>EU</code>,{' '}
              <code className='text-sm font-semibold'>asia-northeast1</code>).
            </li>
            <li>
              Make sure all your datasets are stored in the same location. If they are in different
              locations, select the location where most of your data is stored or create separate
              Storage for each location.
            </li>
            <li>Put this location value in the field above.</li>
          </ol>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

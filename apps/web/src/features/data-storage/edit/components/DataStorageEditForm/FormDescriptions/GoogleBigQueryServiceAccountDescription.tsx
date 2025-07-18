import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalLink } from 'lucide-react';

/**
 * Accordion with step-by-step instructions for obtaining a Google Service Account JSON key.
 */
export default function GoogleBigQueryServiceAccountDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='service-account-details'>
        <AccordionTrigger>How do I get a Service Account JSON key?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            To get the JSON key, you'll need to create or use an existing service account in Google
            Cloud.
          </p>
          <p className='mb-2'>Here's what to do:</p>
          <ol className='list-inside list-decimal space-y-2 text-sm'>
            <li>
              Go to{' '}
              <a
                href='https://console.cloud.google.com/iam-admin/serviceaccounts'
                target='_blank'
                rel='noopener noreferrer'
                className='font-medium underline'
              >
                Google Cloud Console{' '}
                <ExternalLink className='ml-1 inline h-3 w-3' aria-hidden='true' />
              </a>
              .
            </li>
            <li>
              Open <strong>IAM & Admin → Service Accounts</strong>.
            </li>
            <li>Create a new service account or select an existing one.</li>
            <li>
              Assign the <strong>bigquery.dataEditor</strong> and <strong>bigquery.jobUser</strong>{' '}
              roles to this service account to allow read, write, and create access to your project
              resources.
            </li>
            <li>
              Open the Service Accounts page, go to the <strong>Keys</strong> tab, click{' '}
              <strong>Add key</strong>, and select <strong>Create new key</strong>.
            </li>
            <li>
              Choose <strong>JSON</strong> format and click <strong>Create</strong>.
            </li>
            <li>
              Open the downloaded file, copy its entire content, and paste it into the field above.
            </li>
          </ol>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

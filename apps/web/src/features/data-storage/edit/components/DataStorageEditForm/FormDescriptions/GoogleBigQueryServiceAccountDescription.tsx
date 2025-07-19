import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

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
              <ExternalAnchor
                className='underline'
                href='https://console.cloud.google.com/iam-admin/serviceaccounts'
              >
                Google Cloud Console
              </ExternalAnchor>
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

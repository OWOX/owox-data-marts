import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with step-by-step instructions for enabling the AWS Athena API.
 */
export default function StorageTypeAthenaDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='athena-api-details'>
        <AccordionTrigger>How do I activate Athena API?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            AWS Athena is a serverless interactive query service. To use it, you need to activate
            Athena in your AWS account.
          </p>
          <p className='mb-2'>Here's how to activate Athena:</p>
          <ol className='list-inside list-decimal space-y-2 text-sm'>
            <li>
              Open{' '}
              <ExternalAnchor className='underline' href='https://console.aws.amazon.com/athena/'>
                the AWS Athena console
              </ExternalAnchor>{' '}
              and sign in to your AWS account.
            </li>
            <li>
              If you haven't used Athena before, you may need to set up a query result location (an
              S3 bucket).
            </li>
            <li>You can start running queries immediately after setup.</li>
          </ol>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

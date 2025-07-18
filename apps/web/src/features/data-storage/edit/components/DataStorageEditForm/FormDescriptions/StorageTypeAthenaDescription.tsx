import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalLink } from 'lucide-react';

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
              <a
                href='https://console.aws.amazon.com/athena/'
                target='_blank'
                rel='noopener noreferrer'
                className='font-medium underline'
              >
                the AWS Athena console{' '}
                <ExternalLink className='ml-1 inline h-3 w-3' aria-hidden='true' />
              </a>{' '}
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

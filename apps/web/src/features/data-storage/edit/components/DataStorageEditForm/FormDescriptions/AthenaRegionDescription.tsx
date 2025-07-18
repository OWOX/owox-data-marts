import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalLink } from 'lucide-react';

/**
 * Accordion with step-by-step instructions for Region.
 */
export default function AthenaRegionDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='athena-region-details'>
        <AccordionTrigger>How do I find my Athena region?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            Athena queries run in a specific AWS region. You must select the region where your
            Athena service and data are located.
          </p>
          <p className='mb-2'>Here's how to find your Athena region:</p>
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
              </a>
              .
            </li>
            <li>
              Look at the top right corner of the console. The selected region is shown in the
              region selector dropdown.
            </li>
            <li>
              Make sure to copy and paste the same region here in the form to avoid connection or
              query errors.
            </li>
          </ol>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

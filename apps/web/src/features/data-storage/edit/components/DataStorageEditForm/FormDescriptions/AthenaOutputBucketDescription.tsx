import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalLink } from 'lucide-react';

/**
 * Accordion with step-by-step instructions for OutputBucket.
 */
export default function AthenaOutputBucketDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='athena-output-bucket-details'>
        <AccordionTrigger>How do I find a bucket?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            Athena saves query results in an <strong>S3 bucket</strong>. You need to specify the
            bucket used for query output.
          </p>
          <p className='mb-2'>Here's how to find or create an S3 bucket for Athena output:</p>
          <ol className='list-inside list-decimal space-y-2 text-sm'>
            <li>
              Open{' '}
              <a
                href='https://console.aws.amazon.com/s3/'
                target='_blank'
                rel='noopener noreferrer'
                className='font-medium underline'
              >
                the AWS S3 console{' '}
                <ExternalLink className='ml-1 inline h-3 w-3' aria-hidden='true' />
              </a>
              .
            </li>
            <li>Look for an existing bucket used for Athena query results, or create a new one.</li>
            <li>
              If creating a new bucket, make sure it is in the same region as your Athena service.
            </li>
            <li>Enter the bucket name in this form field.</li>
          </ol>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

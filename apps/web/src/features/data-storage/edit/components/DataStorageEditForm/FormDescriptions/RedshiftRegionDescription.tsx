import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with information about AWS Redshift region.
 */
export default function RedshiftRegionDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='redshift-region-details'>
        <AccordionTrigger>What is the AWS region?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            The AWS region is the geographic location where your Redshift cluster or Serverless
            workgroup is hosted.
          </p>
          <p className='mb-2'>Common examples:</p>
          <ul className='list-inside list-disc space-y-1 text-sm'>
            <li>
              <code className='bg-muted rounded px-1 py-0.5'>us-east-1</code> - US East (N.
              Virginia)
            </li>
            <li>
              <code className='bg-muted rounded px-1 py-0.5'>us-west-2</code> - US West (Oregon)
            </li>
            <li>
              <code className='bg-muted rounded px-1 py-0.5'>eu-west-1</code> - Europe (Ireland)
            </li>
            <li>
              <code className='bg-muted rounded px-1 py-0.5'>ap-southeast-1</code> - Asia Pacific
              (Singapore)
            </li>
          </ul>
          <p className='mt-2 text-sm'>
            You can find your region in the{' '}
            <ExternalAnchor className='underline' href='https://console.aws.amazon.com/redshift/'>
              AWS Redshift Console
            </ExternalAnchor>
            .
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

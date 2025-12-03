import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with general information about AWS Redshift storage type.
 */
export default function StorageTypeRedshiftDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='redshift-storage-details'>
        <AccordionTrigger>What is AWS Redshift?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            Amazon Redshift is a fast, fully managed cloud data warehouse that makes it simple and
            cost-effective to analyze data using standard SQL and existing business intelligence
            tools.
          </p>
          <p className='mb-2'>Redshift supports two deployment options:</p>
          <ul className='mb-2 list-inside list-disc space-y-1 text-sm'>
            <li>
              <strong>Redshift Serverless:</strong> Automatically scales compute capacity and you
              only pay for what you use
            </li>
            <li>
              <strong>Provisioned Clusters:</strong> Traditional clusters where you provision and
              manage compute nodes
            </li>
          </ul>
          <p className='text-sm'>
            Learn more in the{' '}
            <ExternalAnchor
              className='underline'
              href='https://docs.aws.amazon.com/redshift/latest/mgmt/welcome.html'
            >
              AWS Redshift Documentation
            </ExternalAnchor>
            .
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with information about Redshift Serverless workgroup.
 */
export default function RedshiftWorkgroupDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='redshift-workgroup-details'>
        <AccordionTrigger>What is a Redshift Serverless workgroup?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            A workgroup is a collection of compute resources in Redshift Serverless. Use this field
            if you're using <strong>Redshift Serverless</strong>.
          </p>
          <p className='mb-2'>
            You can find your workgroup name in the{' '}
            <ExternalAnchor
              className='underline'
              href='https://console.aws.amazon.com/redshiftv2/home#serverless-dashboard'
            >
              Redshift Serverless Console
            </ExternalAnchor>
            .
          </p>
          <p className='text-muted-foreground text-sm'>
            <strong>Note:</strong> You must provide either a workgroup name (for Serverless) OR a
            cluster identifier (for provisioned clusters), but not both.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

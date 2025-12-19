import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with information about Redshift provisioned cluster identifier.
 */
export default function RedshiftClusterDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='redshift-cluster-details'>
        <AccordionTrigger>What is a cluster identifier?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            A cluster identifier is the unique name of your{' '}
            <strong>provisioned Redshift cluster</strong>. Use this field if you're using a
            traditional Redshift cluster (not Serverless).
          </p>
          <p className='mb-2'>
            You can find your cluster identifier in the{' '}
            <ExternalAnchor
              className='underline'
              href='https://console.aws.amazon.com/redshiftv2/home#clusters'
            >
              Redshift Clusters Console
            </ExternalAnchor>
            .
          </p>
          <p className='text-muted-foreground text-sm'>
            <strong>Note:</strong> You must provide either a cluster identifier (for provisioned
            clusters) OR a workgroup name (for Serverless), but not both.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

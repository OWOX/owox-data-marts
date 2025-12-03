import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with information about AWS Access Key ID.
 */
export default function RedshiftAccessKeyIdDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='redshift-access-key-details'>
        <AccordionTrigger>What is an AWS Access Key ID?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            The Access Key ID is part of your AWS security credentials. It's used together with the
            Secret Access Key to authenticate AWS API requests.
          </p>
          <p className='mb-2'>
            Access keys are typically 20 characters long and start with{' '}
            <code className='bg-muted rounded px-1 py-0.5'>AKIA</code> or{' '}
            <code className='bg-muted rounded px-1 py-0.5'>ASIA</code> (for temporary credentials).
          </p>
          <p className='text-sm'>
            You can create access keys in the{' '}
            <ExternalAnchor
              className='underline'
              href='https://console.aws.amazon.com/iam/home#/security_credentials'
            >
              AWS IAM Console
            </ExternalAnchor>
            .
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

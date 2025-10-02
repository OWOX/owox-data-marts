import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { Separator } from '@owox/ui/components/separator';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with step-by-step instructions for AccessKeyId.
 */
export default function AthenaAccessKeyIdDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='athena-access-key-id-details'>
        <AccordionTrigger>How do I get my AWS Access Key ID?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            Before accessing your AWS Access Key ID, make sure you have a user with the necessary
            permissions to use Athena and Glue in your AWS account.
          </p>
          <p className='mb-4 text-sm'>
            Learn more about how to create a user in AWS&nbsp;
            <ExternalAnchor
              className='underline'
              href='https://docs.owox.com/docs/storages/supported-storages/aws-athena/?utm_source=owox_data_marts&utm_medium=storage_enity&utm_campaign=tooltip_aws'
            >
              in documentation
            </ExternalAnchor>
            .
          </p>
          <Separator className='my-4' />
          <p className='mb-2'>
            The Access Key ID is part of your AWS credentials needed to connect and authenticate.
          </p>
          <p className='mb-2'>Here's how to find or create an Access Key ID:</p>
          <ol className='list-inside list-decimal space-y-2 text-sm'>
            <li>
              Open{' '}
              <ExternalAnchor
                className='underline'
                href='https://console.aws.amazon.com/iam/home#/security_credentials'
              >
                the AWS IAM Security Credentials page
              </ExternalAnchor>
              .
            </li>
            <li>
              Under <strong>Access keys</strong>, find your existing keys or create a new access
              key.
            </li>
            <li>
              When you create a new key, download and securely store the Access Key ID and Secret
              Access Key.
            </li>
          </ol>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with step-by-step instructions for SecretAccessKey.
 */
export default function AthenaSecretAccessKeyDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='athena-secret-access-key-details'>
        <AccordionTrigger>How do I get my AWS Secret Access Key?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            The Secret Access Key is part of your AWS credentials needed to connect and
            authenticate. It is only shown when you create a new key.
          </p>
          <p className='mb-2'>Here's how to get your Secret Access Key:</p>
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
              Under <strong>Access keys</strong>, create a new access key if you don't have one or
              lost the secret key.
            </li>
            <li>
              When you create a new key, copy and securely store the Secret Access Key — you won't
              be able to see it again.
            </li>
          </ol>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

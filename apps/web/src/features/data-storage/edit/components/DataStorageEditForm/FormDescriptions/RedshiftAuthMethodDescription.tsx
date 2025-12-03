import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with information about Redshift authentication methods.
 */
export default function RedshiftAuthMethodDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='redshift-auth-method-details'>
        <AccordionTrigger>Which authentication method should I use?</AccordionTrigger>
        <AccordionContent>
          <div className='space-y-3 text-sm'>
            <div>
              <strong>Username & Password:</strong>
              <p className='mt-1'>
                Traditional authentication using a database username and password. This is the
                simplest method for getting started.
              </p>
            </div>
            <div>
              <strong>IAM Role:</strong>
              <p className='mt-1'>
                Uses AWS Identity and Access Management (IAM) for authentication. This method is
                more secure and doesn't require storing database credentials. Recommended for
                production environments.
              </p>
            </div>
            <div>
              <strong>Temporary Credentials:</strong>
              <p className='mt-1'>
                Uses AWS temporary security credentials (access key, secret key, and session token).
                Useful for cross-account access or when using AWS Security Token Service (STS).
              </p>
            </div>
            <p className='mt-2'>
              Learn more in the{' '}
              <ExternalAnchor
                className='underline'
                href='https://docs.aws.amazon.com/redshift/latest/mgmt/redshift-iam-authentication-access-control.html'
              >
                AWS Redshift Authentication Documentation
              </ExternalAnchor>
              .
            </p>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

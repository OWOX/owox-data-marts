import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with information about Redshift IAM authentication.
 */
export default function RedshiftIamDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='redshift-iam-details'>
        <AccordionTrigger>How to set up IAM authentication?</AccordionTrigger>
        <AccordionContent>
          <div className='space-y-3 text-sm'>
            <p>
              IAM authentication uses AWS Identity and Access Management to authenticate to Redshift
              without storing database passwords. The application will use the default AWS
              credentials chain.
            </p>
            <p className='font-medium'>Prerequisites:</p>
            <ol className='list-inside list-decimal space-y-2'>
              <li>
                Ensure your AWS environment has credentials configured (via environment variables,
                IAM role, or AWS credentials file)
              </li>
              <li>
                Grant the{' '}
                <code className='bg-muted rounded px-1 py-0.5'>redshift:GetClusterCredentials</code>{' '}
                permission to your IAM role or user
              </li>
              <li>
                Create a Redshift database user and grant the IAM role permission to generate
                credentials for that user
              </li>
            </ol>
            <p className='mt-2'>
              See{' '}
              <ExternalAnchor
                className='underline'
                href='https://docs.aws.amazon.com/redshift/latest/mgmt/generating-iam-credentials-configure-jdbc-odbc.html'
              >
                AWS documentation on IAM authentication
              </ExternalAnchor>{' '}
              for detailed setup instructions.
            </p>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

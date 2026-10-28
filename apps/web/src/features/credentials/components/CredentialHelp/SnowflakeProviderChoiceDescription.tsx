import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with a brief explanation of the Snowflake providers.
 */
export default function SnowflakeProviderChoiceDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='snowflake-auth-method-details'>
        <AccordionTrigger>Which provider should I choose?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>Snowflake supports two authentication methods:</p>
          <div className='space-y-3 text-sm'>
            <div>
              <strong className='font-medium'>Snowflake password (username and PAT):</strong>
              <p className='mt-1'>
                The simplest method using your Snowflake username and PAT. Suitable for development
                and testing environments.
              </p>
            </div>
            <div>
              <strong className='font-medium'>Snowflake key pair:</strong>
              <p className='mt-1'>
                More secure method using public/private key cryptography. Recommended for production
                environments. You'll need to generate an RSA key pair and assign the public key to
                your Snowflake user.
              </p>
              <p className='mt-1'>
                Learn more about{' '}
                <ExternalAnchor
                  className='underline'
                  href='https://docs.owox.com/docs/storages/supported-storages/snowflake/'
                >
                  authentication methods
                </ExternalAnchor>
                .
              </p>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

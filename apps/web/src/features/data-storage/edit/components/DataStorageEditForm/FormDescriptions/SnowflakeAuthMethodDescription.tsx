import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with step-by-step instructions for Snowflake Authentication Method.
 */
export default function SnowflakeAuthMethodDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='snowflake-auth-method-details'>
        <AccordionTrigger>Which authentication method should I choose?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>Snowflake supports two authentication methods:</p>
          <div className='space-y-3 text-sm'>
            <div>
              <strong className='font-medium'>Username & PAT (Programmatic access token):</strong>
              <p className='mt-1'>
                The simplest method using your Snowflake username and PAT. Suitable for development
                and testing environments.
              </p>
            </div>
            <div>
              <strong className='font-medium'>Key Pair Authentication:</strong>
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

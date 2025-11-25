import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with step-by-step instructions for Snowflake Account.
 */
export default function SnowflakeAccountDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='snowflake-account-details'>
        <AccordionTrigger>How do I find my Snowflake account identifier?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            Your Snowflake account identifier is in the URL when you{' '}
            <ExternalAnchor className='underline' href='https://app.snowflake.com/'>
              log into Snowflake
            </ExternalAnchor>
            . The format depends on your Snowflake URL type:
          </p>
          <ol className='list-inside list-decimal space-y-3 text-sm'>
            <li>
              <strong>app.snowflake.com format:</strong> If your URL looks like{' '}
              <code className='rounded bg-muted px-1 py-0.5'>
                https://app.snowflake.com/europe-west3.gcp/xy12345/
              </code>
              , then your account identifier is{' '}
              <code className='rounded bg-muted px-1 py-0.5'>xy12345.europe-west3.gcp</code>
            </li>
            <li>
              <strong>snowflakecomputing.com format:</strong> If your URL looks like{' '}
              <code className='rounded bg-muted px-1 py-0.5'>
                https://xy12345.us-east-1.snowflakecomputing.com
              </code>
              , then your account identifier is{' '}
              <code className='rounded bg-muted px-1 py-0.5'>xy12345.us-east-1</code>
            </li>
            <li>
              <strong>Organization format:</strong> If your URL looks like{' '}
              <code className='rounded bg-muted px-1 py-0.5'>
                https://myorg-account123.snowflakecomputing.com
              </code>
              , then your account identifier is{' '}
              <code className='rounded bg-muted px-1 py-0.5'>myorg-account123</code>
            </li>
          </ol>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

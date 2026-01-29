import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with step-by-step instructions for generating Personal Access Token.
 */
export default function DatabricksTokenDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='databricks-token-details'>
        <AccordionTrigger>How do I generate a Personal Access Token?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            Personal Access Tokens (PAT) provide secure authentication to Databricks.
          </p>
          <ol className='list-inside list-decimal space-y-3 text-sm'>
            <li>Sign in to your Databricks workspace.</li>
            <li>
              Click your username in the top right corner and select <strong>User Settings</strong>.
            </li>
            <li>
              Go to the <strong>Developer</strong> tab.
            </li>
            <li>
              Next to <strong>Access tokens</strong>, click <strong>Manage</strong>.
            </li>
            <li>
              Click <strong>Generate new token</strong>.
            </li>
            <li>
              (Optional) Enter a comment to describe the purpose of the token (e.g., "OWOX Data
              Marts").
            </li>
            <li>
              (Optional) Set a lifetime for the token. If you don't specify a lifetime, the token
              will never expire.
            </li>
            <li>
              Click <strong>Generate</strong>.
            </li>
            <li>
              <strong className='text-destructive'>
                Copy the displayed token and save it in a secure location
              </strong>
              . You won't be able to see it again.
            </li>
          </ol>
          <div className='bg-muted mt-4 rounded-md p-3'>
            <p className='mb-1 font-medium'>Security recommendations:</p>
            <ul className='list-inside list-disc space-y-1 text-sm'>
              <li>Never share your Personal Access Token with anyone</li>
              <li>Set an expiration date for tokens when possible</li>
              <li>Revoke tokens that are no longer needed</li>
              <li>Use separate tokens for different applications</li>
            </ul>
          </div>
          <div className='mt-4 text-sm'>
            More details in{' '}
            <ExternalAnchor
              className='underline'
              href='https://docs.databricks.com/dev-tools/auth/pat.html'
            >
              Databricks Personal Access Tokens documentation
            </ExternalAnchor>
            .
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

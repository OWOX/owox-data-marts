import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with information about granting permissions for schema creation in Redshift.
 */
export default function RedshiftSchemaPermissionsDescription() {
  return (
    <Accordion variant='common' type='single' collapsible className='text-sm'>
      <AccordionItem value='redshift-schema-permissions'>
        <AccordionTrigger className='text-sm'>
          How to grant permissions for schema creation?
        </AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            You need to grant permissions to the IAM user who will be used to upload data.
          </p>
          <p className='mb-2 text-sm font-medium'>Grant permissions:</p>
          <pre className='bg-muted overflow-x-auto rounded p-2 text-xs'>
            <code>
              GRANT CREATE ON DATABASE &lt;DATABASE_NAME&gt; TO "IAM:&lt;USERNAME_IN_IAM&gt;";
            </code>
          </pre>
          <p className='text-muted-foreground mt-2 text-sm'>
            Replace <code className='bg-muted rounded px-1 py-0.5'>&lt;DATABASE_NAME&gt;</code> with
            your database name and{' '}
            <code className='bg-muted rounded px-1 py-0.5'>&lt;USERNAME_IN_IAM&gt;</code> with your
            IAM username.
          </p>
          <p className='mt-2 text-sm'>
            You can find your IAM username in the{' '}
            <ExternalAnchor className='underline' href='https://console.aws.amazon.com/iam/'>
              AWS IAM Console
            </ExternalAnchor>{' '}
            under the <strong>Users</strong> tab.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

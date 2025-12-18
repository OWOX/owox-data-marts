import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with information about AWS Session Token.
 */
export default function RedshiftSessionTokenDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='redshift-session-token-details'>
        <AccordionTrigger>What is a session token?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            A session token is part of temporary security credentials issued by AWS Security Token
            Service (STS). It's required when using temporary credentials obtained through methods
            like:
          </p>
          <ul className='mb-2 list-inside list-disc space-y-1 text-sm'>
            <li>AWS STS AssumeRole</li>
            <li>AWS STS GetSessionToken</li>
            <li>AWS STS AssumeRoleWithWebIdentity</li>
            <li>Cross-account access scenarios</li>
          </ul>
          <p className='mb-2'>
            Session tokens are temporary and expire after a set period (typically 1-12 hours).
          </p>
          <p className='text-sm'>
            Learn more about{' '}
            <ExternalAnchor
              className='underline'
              href='https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp.html'
            >
              AWS temporary security credentials
            </ExternalAnchor>
            .
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

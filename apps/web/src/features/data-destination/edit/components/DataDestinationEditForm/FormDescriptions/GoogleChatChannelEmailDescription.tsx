import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

export default function GoogleChatChannelEmailDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='google-chat-channel-email-details'>
        <AccordionTrigger>How do I get a Google Chat space email address?</AccordionTrigger>
        <AccordionContent>
          <ol className='list-inside list-decimal space-y-2 text-sm'>
            <li>Open the target space in Google Chat on a computer.</li>
            <li>
              Click the space name, then select <strong>Space settings</strong>.
            </li>
            <li>
              Under <strong>Email</strong>, click <strong>Generate email</strong> if the space does
              not have an address yet.
            </li>
            <li>Copy the space email address and paste it above.</li>
          </ol>
          <p className='mt-2 text-sm'>Only space managers can generate the email address.</p>
          <p className='mt-2 text-sm'>
            See the{' '}
            <ExternalAnchor href='https://support.google.com/chat/answer/14929313'>
              Google Chat email guide
            </ExternalAnchor>{' '}
            for more details.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

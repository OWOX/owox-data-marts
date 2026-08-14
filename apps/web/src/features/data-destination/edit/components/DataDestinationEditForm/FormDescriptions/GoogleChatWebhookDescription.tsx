import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

export default function GoogleChatWebhookDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='google-chat-webhook-details'>
        <AccordionTrigger>How do I get an incoming webhook URL?</AccordionTrigger>
        <AccordionContent>
          <ol className='list-inside list-decimal space-y-2 text-sm'>
            <li>Open the target space in Google Chat on a computer.</li>
            <li>
              Click the space name, then select <strong>Apps &amp; integrations</strong>.
            </li>
            <li>
              Click <strong>Add webhooks</strong>, enter a name, and save the webhook.
            </li>
            <li>
              Open the webhook's menu, select <strong>Copy link</strong>, and paste the URL above.
            </li>
          </ol>
          <p className='mt-2 text-sm'>
            If you cannot add a webhook, your Google Workspace administrator might have disabled
            this option. Keep the webhook URL secret.
          </p>
          <p className='mt-2 text-sm'>
            See the{' '}
            <ExternalAnchor href='https://developers.google.com/workspace/chat/quickstart/webhooks'>
              Google Chat webhook guide
            </ExternalAnchor>{' '}
            for more details.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

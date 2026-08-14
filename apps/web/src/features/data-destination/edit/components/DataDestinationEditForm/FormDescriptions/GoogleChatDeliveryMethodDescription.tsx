import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';

export default function GoogleChatDeliveryMethodDescription({
  deliveryMethod,
}: {
  deliveryMethod: 'webhook' | 'email';
}) {
  const isWebhook = deliveryMethod === 'webhook';

  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='google-chat-delivery-method-details'>
        <AccordionTrigger>
          {isWebhook
            ? 'How does Incoming Webhook delivery work?'
            : 'How does Channel Email delivery work?'}
        </AccordionTrigger>
        <AccordionContent>
          <p className='text-sm'>
            {isWebhook
              ? 'Sends the report directly to the space as formatted Google Chat messages.'
              : 'Sends the report by email to the Google Chat space address. The report appears as an email card in the space.'}
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

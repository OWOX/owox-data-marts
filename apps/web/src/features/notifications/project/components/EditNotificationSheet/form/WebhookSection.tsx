import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { FormSection } from '@owox/ui/components/form';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { FieldItem, FieldLabel, FieldDescription } from './FormField';

interface WebhookSectionProps {
  webhookUrl: string;
  onWebhookUrlChange: (url: string) => void;
  onTest: () => void;
  isTesting?: boolean;
  disabled?: boolean;
  testError?: string | null;
  testSuccess?: boolean;
}

export function WebhookSection({
  webhookUrl,
  onWebhookUrlChange,
  onTest,
  isTesting,
  disabled,
  testError,
  testSuccess,
}: WebhookSectionProps) {
  return (
    <FormSection title='Webhook'>
      <FieldItem>
        <FieldLabel tooltip='URL to send webhook notifications'>URL</FieldLabel>
        <div className='flex gap-2'>
          <Input
            value={webhookUrl}
            onChange={e => {
              onWebhookUrlChange(e.target.value);
            }}
            placeholder='https://example.com/webhook'
            disabled={disabled}
            className='flex-1'
          />
          <Button
            type='button'
            variant='outline'
            onClick={onTest}
            disabled={(disabled ?? false) || (isTesting ?? false) || !webhookUrl}
          >
            {isTesting ? <Loader2 className='h-4 w-4 animate-spin' /> : 'Test'}
          </Button>
        </div>
        {testError && (
          <p className='flex items-center gap-1.5 text-sm text-red-500'>
            <XCircle className='h-4 w-4 shrink-0' />
            {testError}
          </p>
        )}
        {testSuccess && !testError && (
          <p className='flex items-center gap-1.5 text-sm text-green-600'>
            <CheckCircle2 className='h-4 w-4 shrink-0' />
            Test webhook sent successfully
          </p>
        )}
        <FieldDescription>
          <Accordion variant='common' type='single' collapsible>
            <AccordionItem value='webhook-info'>
              <AccordionTrigger>What is this?</AccordionTrigger>
              <AccordionContent>
                Webhooks allow you to receive real-time notifications to your own endpoint. The
                payload includes event details in JSON format.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </FieldDescription>
      </FieldItem>
    </FormSection>
  );
}

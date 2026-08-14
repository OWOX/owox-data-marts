import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@owox/ui/components/form';
import { Input } from '@owox/ui/components/input';
import { Tabs, TabsList, TabsTrigger } from '@owox/ui/components/tabs';
import { useEffect } from 'react';
import { type FieldPathValue, type Path, type UseFormReturn } from 'react-hook-form';
import { type DataDestinationFormData } from '../../../shared';
import { EmailFields } from './EmailFields';
import GoogleChatChannelEmailDescription from './FormDescriptions/GoogleChatChannelEmailDescription';
import GoogleChatDeliveryMethodDescription from './FormDescriptions/GoogleChatDeliveryMethodDescription';
import GoogleChatWebhookDescription from './FormDescriptions/GoogleChatWebhookDescription';

const WEBHOOK_FIELD_PATH = 'credentials.webhookUrl' as Path<DataDestinationFormData>;
const DELIVERY_METHOD_FIELD_PATH = 'credentials.deliveryMethod' as Path<DataDestinationFormData>;
const WEBHOOK_HELP =
  'Paste the incoming webhook URL copied from Apps & integrations in your Google Chat space.';

export function GoogleChatFields({ form }: { form: UseFormReturn<DataDestinationFormData> }) {
  const watchedDeliveryMethod = form.watch(DELIVERY_METHOD_FIELD_PATH) as string | undefined;
  const deliveryMethod = watchedDeliveryMethod === 'email' ? 'email' : 'webhook';
  const configured = form.watch('credentials.configured' as Path<DataDestinationFormData>) as
    | boolean
    | undefined;

  useEffect(() => {
    if (watchedDeliveryMethod !== 'email' && watchedDeliveryMethod !== 'webhook') {
      form.setValue(
        DELIVERY_METHOD_FIELD_PATH,
        'webhook' as FieldPathValue<DataDestinationFormData, typeof DELIVERY_METHOD_FIELD_PATH>,
        { shouldDirty: false, shouldValidate: false }
      );
    }
  }, [form, watchedDeliveryMethod]);

  const handleDeliveryMethodChange = (value: string) => {
    if (value !== 'email' && value !== 'webhook') return;
    form.setValue(
      DELIVERY_METHOD_FIELD_PATH,
      value as FieldPathValue<DataDestinationFormData, typeof DELIVERY_METHOD_FIELD_PATH>,
      { shouldDirty: true, shouldTouch: true, shouldValidate: true }
    );
  };

  return (
    <div className='space-y-4'>
      <FormItem>
        <div className='flex items-center justify-between'>
          <FormLabel>Delivery Method</FormLabel>
          <Tabs value={deliveryMethod} onValueChange={handleDeliveryMethodChange}>
            <TabsList aria-label='Delivery method'>
              <TabsTrigger value='webhook'>Incoming Webhook</TabsTrigger>
              <TabsTrigger value='email'>Channel Email</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <FormDescription>
          <GoogleChatDeliveryMethodDescription deliveryMethod={deliveryMethod} />
        </FormDescription>
      </FormItem>

      {deliveryMethod === 'webhook' ? (
        <FormField
          control={form.control}
          name={WEBHOOK_FIELD_PATH}
          render={({ field }) => (
            <FormItem>
              <FormLabel tooltip={WEBHOOK_HELP}>Google Chat incoming webhook URL</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type='password'
                  autoComplete='off'
                  value={typeof field.value === 'string' ? field.value : ''}
                  placeholder={
                    configured
                      ? 'Webhook configured — paste a new URL to replace it'
                      : 'https://chat.googleapis.com/v1/spaces/.../messages?key=...&token=...'
                  }
                />
              </FormControl>
              <FormDescription>
                <GoogleChatWebhookDescription />
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <EmailFields
          form={form}
          emailsFieldTitle='Enter Google Chat channel emails list'
          description={<GoogleChatChannelEmailDescription />}
        />
      )}
    </div>
  );
}

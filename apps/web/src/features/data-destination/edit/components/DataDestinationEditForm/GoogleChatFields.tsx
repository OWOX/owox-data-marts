import { FormDescription, FormItem, FormLabel } from '@owox/ui/components/form';
import { Tabs, TabsList, TabsTrigger } from '@owox/ui/components/tabs';
import { useEffect, type ReactNode } from 'react';
import { type FieldPathValue, type Path, type UseFormReturn } from 'react-hook-form';
import { type DataDestinationFormData } from '../../../shared';
import { EmailFields } from './EmailFields';
import GoogleChatChannelEmailDescription from './FormDescriptions/GoogleChatChannelEmailDescription';
import GoogleChatDeliveryMethodDescription from './FormDescriptions/GoogleChatDeliveryMethodDescription';

const DELIVERY_METHOD_FIELD_PATH = 'credentials.deliveryMethod' as Path<DataDestinationFormData>;

export function GoogleChatFields({
  form,
  credentialField,
}: {
  form: UseFormReturn<DataDestinationFormData>;
  /** The form's Credential field, for webhook delivery. */
  credentialField: ReactNode;
}) {
  const watchedDeliveryMethod = form.watch(DELIVERY_METHOD_FIELD_PATH) as string | undefined;
  const deliveryMethod = watchedDeliveryMethod === 'email' ? 'email' : 'webhook';

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
        credentialField
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

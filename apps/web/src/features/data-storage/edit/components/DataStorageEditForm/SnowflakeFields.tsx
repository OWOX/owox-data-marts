import { Input } from '@owox/ui/components/input';
import { Textarea } from '@owox/ui/components/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@owox/ui/components/tabs';
import { DataStorageType, SnowflakeAuthMethod } from '../../../shared';
import type { DataStorageFormData } from '../../../shared/types/data-storage.schema.ts';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormSection,
  FormDescription,
} from '@owox/ui/components/form';
import type { UseFormReturn } from 'react-hook-form';
import SnowflakeAccountDescription from './FormDescriptions/SnowflakeAccountDescription.tsx';
import SnowflakeWarehouseDescription from './FormDescriptions/SnowflakeWarehouseDescription.tsx';
import SnowflakeAuthMethodDescription from './FormDescriptions/SnowflakeAuthMethodDescription.tsx';
import SnowflakeUsernameDescription from './FormDescriptions/SnowflakeUsernameDescription.tsx';
import SnowflakePasswordDescription from './FormDescriptions/SnowflakePasswordDescription.tsx';
import SnowflakeKeyPairDescription from './FormDescriptions/SnowflakeKeyPairDescription.tsx';
import SnowflakePassphraseDescription from './FormDescriptions/SnowflakePassphraseDescription.tsx';

interface SnowflakeFieldsProps {
  form: UseFormReturn<DataStorageFormData>;
}

export const SnowflakeFields = ({ form }: SnowflakeFieldsProps) => {
  const authMethod = form.watch('credentials.authMethod');

  if (form.watch('type') !== DataStorageType.SNOWFLAKE) {
    return null;
  }

  return (
    <>
      {/* Connection Settings */}
      <FormSection title='Connection Settings'>
        <FormField
          control={form.control}
          name='config.account'
          render={({ field }) => (
            <FormItem>
              <FormLabel tooltip='Enter your Snowflake account identifier'>Account</FormLabel>
              <FormControl>
                <Input {...field} placeholder='e.g., xy12345.us-east-1' />
              </FormControl>
              <FormDescription>
                <SnowflakeAccountDescription />
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='config.warehouse'
          render={({ field }) => (
            <FormItem>
              <FormLabel tooltip='Specify the Snowflake warehouse to use for query execution'>
                Warehouse
              </FormLabel>
              <FormControl>
                <Input {...field} placeholder='Enter warehouse name' />
              </FormControl>
              <FormDescription>
                <SnowflakeWarehouseDescription />
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormSection>

      {/* Authentication */}
      <FormSection title='Authentication'>
        <FormField
          control={form.control}
          name='credentials.authMethod'
          render={({ field }) => (
            <FormItem>
              <div className='flex items-center justify-between'>
                <FormLabel>Authentication Method</FormLabel>
                <Tabs value={field.value} onValueChange={field.onChange}>
                  <TabsList>
                    <TabsTrigger value={SnowflakeAuthMethod.PASSWORD}>
                      Username & Password
                    </TabsTrigger>
                    <TabsTrigger value={SnowflakeAuthMethod.KEY_PAIR}>
                      Key Pair
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <FormDescription>
                <SnowflakeAuthMethodDescription />
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='credentials.username'
          render={({ field }) => (
            <FormItem>
              <FormLabel tooltip='Your Snowflake username'>Username</FormLabel>
              <FormControl>
                <Input {...field} placeholder='Enter username' />
              </FormControl>
              <FormDescription>
                <SnowflakeUsernameDescription />
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {authMethod === SnowflakeAuthMethod.PASSWORD && (
          <FormField
            control={form.control}
            name='credentials.password'
            render={({ field }) => (
              <FormItem>
                <FormLabel tooltip='Your Snowflake password'>Password</FormLabel>
                <FormControl>
                  <Input {...field} type='password' placeholder='Enter password' />
                </FormControl>
                <FormDescription>
                  <SnowflakePasswordDescription />
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {authMethod === SnowflakeAuthMethod.KEY_PAIR && (
          <>
            <FormField
              control={form.control}
              name='credentials.privateKey'
              render={({ field }) => (
                <FormItem>
                  <FormLabel tooltip='Paste your private key in PEM format'>
                    Private Key
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder='-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----'
                      rows={6}
                    />
                  </FormControl>
                  <FormDescription>
                    <SnowflakeKeyPairDescription />
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='credentials.privateKeyPassphrase'
              render={({ field }) => (
                <FormItem>
                  <FormLabel tooltip='Enter the passphrase if your private key is encrypted'>
                    Passphrase (Optional)
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type='password'
                      value={field.value || ''}
                      placeholder='Enter passphrase if key is encrypted'
                    />
                  </FormControl>
                  <FormDescription>
                    <SnowflakePassphraseDescription />
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}
      </FormSection>
    </>
  );
};

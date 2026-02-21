import { Button } from '@owox/ui/components/button';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSection,
} from '@owox/ui/components/form';
import { Input } from '@owox/ui/components/input';
import { Tabs, TabsList, TabsTrigger } from '@owox/ui/components/tabs';
import { Textarea } from '@owox/ui/components/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { useState, useEffect } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Combobox } from '../../../../../shared/components/Combobox/combobox.tsx';
import { getServiceAccountLink } from '../../../../../utils/google-cloud-utils';
import { GoogleOAuthConnectButton, storageOAuthApi } from '../../../../../features/google-oauth';
import type { LegacyGoogleBigQueryFormData } from '../../../shared';
import { googleBigQueryLocationOptions } from '../../../shared';
import GoogleBigQueryOAuthDescription from './FormDescriptions/GoogleBigQueryOAuthDescription';
import GoogleBigQueryServiceAccountDescription from './FormDescriptions/GoogleBigQueryServiceAccountDescription';
import LegacyGoogleBigQueryLocationDescription from './FormDescriptions/LegacyGoogleBigQueryLocationDescription.tsx';
import LegacyGoogleBigQueryProjectIdDescription from './FormDescriptions/LegacyGoogleBigQueryProjectIdDescription.tsx';

interface LegacyGoogleBigQueryFieldsProps {
  form: UseFormReturn<LegacyGoogleBigQueryFormData>;
  storageId?: string;
}

const LEGACY_AUTODETECT_LOCATION = 'AUTODETECT';

const legacyGoogleBigQueryLocationOptions = [
  {
    value: LEGACY_AUTODETECT_LOCATION,
    label: 'Auto-detect location',
    group: 'General',
  },
  ...googleBigQueryLocationOptions,
];

export const LegacyGoogleBigQueryFields = ({
  form,
  storageId,
}: LegacyGoogleBigQueryFieldsProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isOAuthAvailable, setIsOAuthAvailable] = useState<boolean | null>(null);
  const [oauthRedirectUri, setOauthRedirectUri] = useState<string | undefined>(undefined);
  const [authMethod, setAuthMethod] = useState<'oauth' | 'service-account'>(() => {
    const sa = form.getValues('credentials.serviceAccount');
    return sa?.trim() ? 'service-account' : 'oauth';
  });

  useEffect(() => {
    storageOAuthApi
      .getSettings()
      .then(s => {
        setIsOAuthAvailable(s.available);
        setOauthRedirectUri(s.redirectUri);
        if (!s.available) {
          setAuthMethod('service-account');
        }
      })
      .catch(() => {
        setIsOAuthAvailable(false);
        setAuthMethod('service-account');
      });
  }, []);

  const handleOAuthSuccess = (credentialId: string) => {
    form.setValue('credentials.credentialId', credentialId, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue('credentials.serviceAccount', '');
  };

  const handleOAuthStatusChange = (isConnected: boolean, credentialId?: string) => {
    if (isConnected && credentialId) {
      setAuthMethod('oauth');
      form.setValue('credentials.credentialId', credentialId, { shouldDirty: false });
      form.setValue('credentials.serviceAccount', '');
    }
  };

  const handleAuthMethodChange = (value: 'oauth' | 'service-account') => {
    setAuthMethod(value);
    if (value === 'service-account') {
      form.setValue('credentials.credentialId', null);
    } else {
      form.setValue('credentials.serviceAccount', '');
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
    form.setValue('credentials.serviceAccount', '', {
      shouldDirty: true,
    });
  };

  const handleCancel = () => {
    setIsEditing(false);
    form.resetField('credentials.serviceAccount');
  };

  const serviceAccountValue = form.watch('credentials.serviceAccount');
  const serviceAccountLink = serviceAccountValue
    ? getServiceAccountLink(serviceAccountValue)
    : null;

  return (
    <>
      {/* Connection Settings */}
      <FormSection title='Connection Settings'>
        <FormField
          control={form.control}
          name='config.projectId'
          render={({ field }) => (
            <FormItem>
              <FormLabel tooltip='The ID of your Google Cloud project associated with this storage'>
                Project ID
              </FormLabel>
              <FormControl>
                <Input {...field} disabled />
              </FormControl>
              <FormDescription>
                <LegacyGoogleBigQueryProjectIdDescription />
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='config.location'
          render={({ field }) => (
            <FormItem>
              <FormLabel tooltip='Choose the same region where your BigQuery data is stored to ensure queries work correctly or use auto-detect option'>
                Location
              </FormLabel>
              <FormControl>
                <Combobox
                  options={legacyGoogleBigQueryLocationOptions}
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder='Select a location'
                  emptyMessage='No locations found'
                  className='w-full'
                />
              </FormControl>
              <FormDescription>
                <LegacyGoogleBigQueryLocationDescription />
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormSection>

      {/* Authentication */}
      <FormSection title='Authentication'>
        <div className='space-y-4'>
          {isOAuthAvailable && (
            <FormItem>
              <div className='flex items-center justify-between'>
                <FormLabel>Authentication Method</FormLabel>
                <Tabs
                  value={authMethod}
                  onValueChange={v => {
                    handleAuthMethodChange(v as 'oauth' | 'service-account');
                  }}
                >
                  <TabsList>
                    <TabsTrigger value='oauth'>Connect with Google</TabsTrigger>
                    <TabsTrigger value='service-account'>Service Account JSON</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </FormItem>
          )}

          {isOAuthAvailable && authMethod === 'oauth' && storageId && (
            <FormItem>
              <div className='mb-4 flex items-center justify-between'>
                <FormLabel tooltip='Authorize Owox to access your BigQuery datasets'>
                  Connect with Google OAuth
                </FormLabel>
              </div>
              <GoogleOAuthConnectButton
                resourceType='storage'
                resourceId={storageId}
                redirectUri={oauthRedirectUri}
                onSuccess={handleOAuthSuccess}
                onStatusChange={handleOAuthStatusChange}
              />
              <FormDescription>
                <GoogleBigQueryOAuthDescription />
              </FormDescription>
            </FormItem>
          )}

          {authMethod === 'service-account' && (
            <FormField
              control={form.control}
              name='credentials.serviceAccount'
              render={({ field }) => (
                <FormItem>
                  <div className='flex items-center justify-between'>
                    <FormLabel tooltip='Paste a JSON key from a service account that has access to the selected storage provider'>
                      Service Account
                    </FormLabel>
                    {!isEditing && serviceAccountValue && (
                      <Button variant='ghost' size='sm' onClick={handleEdit} type='button'>
                        Edit
                      </Button>
                    )}
                    {isEditing && (
                      <Button variant='ghost' size='sm' onClick={handleCancel} type='button'>
                        Cancel
                      </Button>
                    )}
                  </div>
                  <FormControl>
                    {!isEditing && serviceAccountLink ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <ExternalAnchor href={serviceAccountLink.url}>
                            {serviceAccountLink.email}
                          </ExternalAnchor>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>View in Google Cloud Console</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Textarea
                        {...field}
                        className='min-h-[150px] font-mono'
                        rows={8}
                        placeholder='Paste your service account JSON here'
                      />
                    )}
                  </FormControl>
                  <FormDescription>
                    <GoogleBigQueryServiceAccountDescription />
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
      </FormSection>
    </>
  );
};

import { Button } from '@owox/ui/components/button';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSection,
} from '@owox/ui/components/form';
import { Textarea } from '@owox/ui/components/textarea';
import { useState, useEffect } from 'react';
import { type UseFormReturn } from 'react-hook-form';
import { type DataDestinationFormData } from '../../../shared';
import GoogleSheetsServiceAccountDescription from './FormDescriptions/GoogleSheetsServiceAccountDescription';
import GoogleSheetsOAuthDescription from './FormDescriptions/GoogleSheetsOAuthDescription';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
import { getServiceAccountLink } from '../../../../../utils/google-cloud-utils';
import {
  GoogleOAuthConnectButton,
  destinationOAuthApi,
} from '../../../../../features/google-oauth';
import { Tabs, TabsList, TabsTrigger } from '@owox/ui/components/tabs';

interface GoogleSheetsFieldsProps {
  form: UseFormReturn<DataDestinationFormData>;
  destinationId?: string;
}

export function GoogleSheetsFields({ form, destinationId }: GoogleSheetsFieldsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isOAuthAvailable, setIsOAuthAvailable] = useState<boolean | null>(null);
  const [oauthRedirectUri, setOauthRedirectUri] = useState<string | undefined>(undefined);
  const [authMethod, setAuthMethod] = useState<'oauth' | 'service-account'>(() => {
    const sa = form.getValues('credentials.serviceAccount');
    return sa?.trim() ? 'service-account' : 'oauth';
  });

  useEffect(() => {
    destinationOAuthApi
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

  const credentialIdValue = form.watch('credentials.credentialId');

  const handleOAuthStatusChange = (isConnected: boolean, credentialId?: string) => {
    if (isConnected && credentialId) {
      setAuthMethod('oauth');
      form.setValue('credentials.credentialId', credentialId, { shouldDirty: false });
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

  const handleOAuthSuccess = (credentialId: string) => {
    form.setValue('credentials.credentialId', credentialId, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue('credentials.serviceAccount', '');
  };

  const handleAuthMethodChange = (value: 'oauth' | 'service-account') => {
    setAuthMethod(value);
    if (value === 'oauth') {
      form.setValue('credentials.serviceAccount', '');
    } else {
      form.setValue('credentials.credentialId', null);
    }
  };

  return (
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

        {isOAuthAvailable && authMethod === 'oauth' && (
          <FormItem>
            <div className='mb-4 flex items-center justify-between'>
              <FormLabel tooltip='Authorize Owox to access your Google Sheets'>
                Connect with Google OAuth
              </FormLabel>
            </div>
            <GoogleOAuthConnectButton
              resourceType='destination'
              resourceId={destinationId}
              credentialId={credentialIdValue ?? undefined}
              redirectUri={oauthRedirectUri}
              onSuccess={handleOAuthSuccess}
              onStatusChange={handleOAuthStatusChange}
            />
            <FormDescription>
              <GoogleSheetsOAuthDescription />
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
                  <FormLabel tooltip='Paste a JSON key from a service account that has access to the selected destination provider'>
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
                  <GoogleSheetsServiceAccountDescription />
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>
    </FormSection>
  );
}

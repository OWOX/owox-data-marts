import { Button } from '@owox/ui/components/button';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@owox/ui/components/form';
import { FileDropTextarea } from '@owox/ui/components/file-drop-textarea';
import { Input } from '@owox/ui/components/input';
import { toast } from 'react-hot-toast';
import { useState, useEffect } from 'react';
import { type UseFormReturn } from 'react-hook-form';
import { type DataDestinationFormData, DataDestinationType } from '../../../shared';
import GoogleSheetsServiceAccountDescription from './FormDescriptions/GoogleSheetsServiceAccountDescription';
import GoogleSheetsOAuthDescription from './FormDescriptions/GoogleSheetsOAuthDescription';
import GoogleSheetsAuthMethodDescription from './FormDescriptions/GoogleSheetsAuthMethodDescription';
import { CopyableField } from '@owox/ui/components/common/copyable-field';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { getServiceAccountLink } from '../../../../../utils';
import { Copy, Check, ExternalLink } from 'lucide-react';
import {
  isValidGoogleDriveFolderUrl,
  buildDriveFolderUrl,
} from '../../../shared/utils/drive-folder-url.utils';
import { useGoogleDrivePicker } from '../../../shared/hooks/useGoogleDrivePicker';
import { GoogleOAuthConnectButton, destinationOAuthApi } from '../../../../google-oauth';
import { Tabs, TabsList, TabsTrigger } from '@owox/ui/components/tabs';
import { AuthenticationSectionHeader } from '../../../../../shared/components/AuthenticationSectionHeader';
import { CopyDestinationCredentialsButton } from '../CopyDestinationCredentialsButton';
import { useCopyCredentialContext } from '../../model/context/useCopyCredentialContext';

interface GoogleSheetsFieldsProps {
  form: UseFormReturn<DataDestinationFormData>;
}

export function GoogleSheetsFields({ form }: GoogleSheetsFieldsProps) {
  const {
    entityId: destinationId,
    onSourceSelect: onSourceDestinationSelect,
    selectedSource,
    onSourceClear,
  } = useCopyCredentialContext();
  const [isEditing, setIsEditing] = useState(false);
  const [isOAuthAvailable, setIsOAuthAvailable] = useState<boolean | null>(null);
  const [oauthRedirectUri, setOauthRedirectUri] = useState<string | undefined>(undefined);
  const [authMethod, setAuthMethod] = useState<'oauth' | 'service-account'>(() => {
    const sa = form.getValues('credentials.serviceAccount');
    return sa?.trim() ? 'service-account' : 'oauth';
  });
  const [stashedServiceAccount, setStashedServiceAccount] = useState<string | undefined>(undefined);
  const [stashedCredentialId, setStashedCredentialId] = useState<string | null | undefined>(
    undefined
  );
  const [oauthEmail, setOauthEmail] = useState<string | null>(null);
  const [saCopied, setSaCopied] = useState(false);
  const [oauthClientId, setOauthClientId] = useState<string | undefined>(undefined);
  const [pickerApiKey, setPickerApiKey] = useState<string | undefined>(undefined);
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const { openPicker } = useGoogleDrivePicker();

  useEffect(() => {
    destinationOAuthApi
      .getSettings()
      .then(s => {
        setIsOAuthAvailable(s.available);
        setOauthRedirectUri(s.redirectUri);
        setOauthClientId(s.clientId);
        setPickerApiKey(s.pickerApiKey);
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

  useEffect(() => {
    const abortController = new AbortController();
    if (authMethod === 'oauth' && credentialIdValue) {
      destinationOAuthApi
        .getCredentialStatus(credentialIdValue, { signal: abortController.signal })
        .then(status => {
          setOauthEmail(status.user?.email ?? null);
        })
        .catch(() => {
          setOauthEmail(null);
        });
    } else {
      setOauthEmail(null);
    }
    return () => {
      abortController.abort();
    };
  }, [authMethod, credentialIdValue]);

  const handleOAuthStatusChange = (isConnected: boolean, credentialId?: string) => {
    if (isConnected && credentialId) {
      setAuthMethod('oauth');
      form.setValue('credentials.credentialId', credentialId, {
        shouldDirty: false,
        shouldValidate: true,
      });
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
    if (value === 'oauth') {
      setStashedServiceAccount(form.getValues('credentials.serviceAccount'));
      form.setValue('credentials.serviceAccount', '');
      if (stashedCredentialId) {
        form.setValue('credentials.credentialId', stashedCredentialId);
      }
    } else {
      setStashedCredentialId(form.getValues('credentials.credentialId'));
      form.setValue('credentials.credentialId', null);
      if (stashedServiceAccount) {
        form.setValue('credentials.serviceAccount', stashedServiceAccount);
      }
    }
    setAuthMethod(value);
  };

  const folderUrl = form.watch('config.folderUrl');
  const isFolderConfigured = !!folderUrl?.trim() && isValidGoogleDriveFolderUrl(folderUrl.trim());
  const canPickFolder = !!pickerApiKey && !!oauthClientId;

  const handlePickFolder = () => {
    if (!pickerApiKey || !oauthClientId) {
      return;
    }
    setIsPickingFolder(true);
    void openPicker({
      apiKey: pickerApiKey,
      clientId: oauthClientId,
      hintEmail: oauthEmail ?? undefined,
      onPicked: folder => {
        form.setValue('config.folderUrl', buildDriveFolderUrl(folder.id), {
          shouldDirty: true,
          shouldValidate: true,
        });
      },
      onError: message => {
        toast.error(message);
      },
    }).finally(() => {
      setIsPickingFolder(false);
    });
  };

  return (
    <div className='mb-4 flex flex-col gap-2'>
      <AuthenticationSectionHeader
        itemType='destination'
        copyButton={
          <CopyDestinationCredentialsButton
            destinationType={DataDestinationType.GOOGLE_SHEETS}
            currentDestinationId={destinationId}
            onSelect={onSourceDestinationSelect}
          />
        }
        selectedSource={selectedSource}
        onSourceClear={onSourceClear}
      />
      {!selectedSource && (
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
              <FormDescription>
                <GoogleSheetsAuthMethodDescription />
              </FormDescription>
            </FormItem>
          )}

          {isOAuthAvailable && authMethod === 'oauth' && (
            <FormField
              control={form.control}
              name='credentials.credentialId'
              render={() => (
                <FormItem>
                  <div className='mb-4 flex items-center justify-between'>
                    <FormLabel tooltip='Authorize OWOX to access your Google Sheets'>
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
                  {oauthEmail && (
                    <div className='mt-2 flex flex-col gap-1'>
                      <FormLabel>Authenticated email</FormLabel>
                      <CopyableField value={oauthEmail}>{oauthEmail}</CopyableField>
                    </div>
                  )}
                  <FormDescription>
                    <GoogleSheetsOAuthDescription />
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {isOAuthAvailable && authMethod === 'oauth' && credentialIdValue && canPickFolder && (
            <FormItem>
              <FormLabel tooltip='New documents created from chat or reports are placed in this Drive folder'>
                Drive folder for auto-created documents (optional)
              </FormLabel>
              <div className='flex items-center gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={handlePickFolder}
                  disabled={isPickingFolder}
                >
                  {isFolderConfigured ? 'Change folder' : 'Choose folder'}
                </Button>
                {isFolderConfigured && folderUrl && (
                  <ExternalAnchor
                    href={folderUrl.trim()}
                    variant='field'
                    className='flex-1 truncate'
                  >
                    {folderUrl.trim()}
                  </ExternalAnchor>
                )}
                {isFolderConfigured && (
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    onClick={() => {
                      form.setValue('config.folderUrl', '', {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <FormDescription>
                New documents created with “Create document” are placed in this Google Drive folder.
                Leave empty to create them in your Drive root.
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
                      <div className='flex items-center gap-2'>
                        <ExternalAnchor
                          href={serviceAccountLink.url}
                          variant='field'
                          className='flex-1 truncate'
                        >
                          {serviceAccountLink.email}
                        </ExternalAnchor>
                        <button
                          type='button'
                          onClick={() => {
                            void navigator.clipboard.writeText(serviceAccountLink.email);
                            setSaCopied(true);
                            setTimeout(() => {
                              setSaCopied(false);
                            }, 2000);
                          }}
                          className='text-muted-foreground hover:text-foreground hover:bg-accent shrink-0 rounded-md p-1 transition-colors'
                          aria-label='Copy email'
                        >
                          {saCopied ? (
                            <Check className='h-4 w-4 text-green-500' />
                          ) : (
                            <Copy className='h-4 w-4' />
                          )}
                        </button>
                      </div>
                    ) : (
                      <FileDropTextarea
                        {...field}
                        className='min-h-[150px] font-mono'
                        rows={8}
                        placeholder='Paste your service account JSON here or drag & drop the file'
                        onFileRead={content => {
                          form.setValue('credentials.serviceAccount', content, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                        }}
                        onFileReject={error => {
                          toast.error(error);
                        }}
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

          {authMethod === 'service-account' && (
            <FormField
              control={form.control}
              name='config.folderUrl'
              render={({ field }) => {
                const folderUrl = (field.value ?? '').trim();
                const isValidFolderUrl = !!folderUrl && isValidGoogleDriveFolderUrl(folderUrl);
                return (
                  <FormItem>
                    <FormLabel tooltip='New documents created from chat or reports are placed in this Shared Drive folder'>
                      Drive folder for auto-created documents (optional)
                    </FormLabel>
                    <FormControl>
                      <div className='flex items-center gap-2'>
                        <Input
                          placeholder='https://drive.google.com/drive/folders/…'
                          className='flex-1'
                          {...field}
                          value={field.value ?? ''}
                        />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type='button'
                              className={`flex-shrink-0 rounded-md p-2 transition-all duration-200 ${
                                isValidFolderUrl
                                  ? 'text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/20 dark:hover:text-blue-300'
                                  : 'text-muted-foreground/30 cursor-not-allowed'
                              }`}
                              onClick={() => {
                                if (isValidFolderUrl) {
                                  window.open(folderUrl, '_blank', 'noopener,noreferrer');
                                }
                              }}
                              disabled={!isValidFolderUrl}
                              aria-label={
                                isValidFolderUrl
                                  ? 'Open folder in new tab'
                                  : 'Folder link is not valid'
                              }
                            >
                              <ExternalLink className='h-4 w-4' aria-hidden='true' />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side='top' align='center' role='tooltip'>
                            {isValidFolderUrl
                              ? 'Open folder in new tab'
                              : 'Paste a valid Drive folder URL to enable link'}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </FormControl>
                    <FormDescription>
                      Paste a Google Drive folder URL. New documents created with “Create document”
                      are placed here. Use a Shared Drive folder and add the service account email
                      above as a member with the Content Manager role. Leave empty to create files
                      in the service account’s Drive.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

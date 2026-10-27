import { Button } from '@owox/ui/components/button';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@owox/ui/components/form';
import { Input } from '@owox/ui/components/input';
import { toast } from 'react-hot-toast';
import { useState, useEffect, type ReactNode } from 'react';
import { type UseFormReturn } from 'react-hook-form';
import { type DataDestinationFormData, type DestinationCredentialSummary } from '../../../shared';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { ExternalLink } from 'lucide-react';
import {
  isValidGoogleDriveFolderUrl,
  buildDriveFolderUrl,
} from '../../../shared/utils/drive-folder-url.utils';
import { useGoogleDrivePicker } from '../../../shared/hooks/useGoogleDrivePicker';
import { AuthenticationSectionHeader } from '../../../../../shared/components/AuthenticationSectionHeader';
import { destinationOAuthApi } from '../../../../google-oauth';
import { useCredentials, type Credential } from '../../../../credentials';

interface GoogleSheetsFieldsProps {
  form: UseFormReturn<DataDestinationFormData>;
  /** The form's Credential field. */
  credentialField: ReactNode;
  /** The Credential the Destination is bound to, as the member sees it. */
  summary: DestinationCredentialSummary | null;
  /** A Credential just created from the field, until the refetched list holds it. */
  created?: Credential | null;
}

export function GoogleSheetsFields({
  form,
  credentialField,
  summary,
  created,
}: GoogleSheetsFieldsProps) {
  const [oauthClientId, setOauthClientId] = useState<string | undefined>(undefined);
  const [pickerApiKey, setPickerApiKey] = useState<string | undefined>(undefined);
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const { openPicker } = useGoogleDrivePicker();
  const { credentials } = useCredentials();
  // A Credential the member cannot see keeps the folder input the Destination already has.
  const [hadFolder] = useState(() => Boolean(form.getValues('config.folderUrl')));

  useEffect(() => {
    destinationOAuthApi
      .getSettings()
      .then(s => {
        setOauthClientId(s.clientId);
        setPickerApiKey(s.pickerApiKey);
      })
      .catch(() => undefined);
  }, []);

  // The Drive folder follows the provider of the selected Credential.
  const credentialId = form.watch('reusableCredentialId');
  const selected =
    credentials.find(credential => credential.id === credentialId) ??
    (created?.id === credentialId ? created : undefined);
  // A Credential the member cannot see, or the Destination's own key, names its provider too.
  const keepsBinding =
    summary !== null &&
    (summary.access === 'visible' ? summary.id === credentialId : !credentialId);
  const kept = keepsBinding ? summary : null;
  const definitionId = selected?.definition.id ?? kept?.definitionId;
  const identity = selected?.identity ?? kept?.identity ?? null;
  let folderInput: 'url' | 'picker' | null = null;
  if (definitionId === 'google-service-account') folderInput = 'url';
  else if (definitionId === 'google-sheets-oauth') folderInput = 'picker';
  else if (!credentialId && summary && hadFolder) folderInput = 'url';

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
      hintEmail: identity ?? undefined,
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
      <AuthenticationSectionHeader />
      <div className='space-y-4'>
        {credentialField}

        {folderInput === 'picker' && canPickFolder && (
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
                <ExternalAnchor href={folderUrl.trim()} variant='field' className='flex-1 truncate'>
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

        {folderInput === 'url' && (
          <FormField
            control={form.control}
            name='config.folderUrl'
            render={({ field }) => {
              const folderUrl = (field.value ?? '').trim();
              const isValidFolderUrl = !!folderUrl && isValidGoogleDriveFolderUrl(folderUrl);
              return (
                <FormItem>
                  <FormLabel tooltip='New documents created from chat or reports are placed in this Shared Drive folder'>
                    Drive folder for auto-created documents (required)
                  </FormLabel>
                  <div className='flex items-center gap-2'>
                    {/* On the input itself, so a rejected folder marks and focuses the input
                      and the label points at it — not at the row around it. */}
                    <FormControl>
                      <Input
                        placeholder='https://drive.google.com/drive/folders/…'
                        className='flex-1'
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
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
                            isValidFolderUrl ? 'Open folder in new tab' : 'Folder link is not valid'
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
                  <FormDescription>
                    Paste a Google Drive folder URL. New documents created with “Create document”
                    are placed here. A Shared Drive folder is required — add the service account
                    email of the Credential as a member with the Content Manager role.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
        )}
      </div>
    </div>
  );
}

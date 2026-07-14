import { useState, type ChangeEvent } from 'react';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { FileDropTextarea } from '@owox/ui/components/file-drop-textarea';
import { AppWizardStepLabel } from '@owox/ui/components/common/wizard';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
import { Copy, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getServiceAccountLink } from '../../../../../../../utils';
import { SECRET_MASK } from '../../../../../../../shared/constants/secrets';
import GoogleSheetsServiceAccountDescription from '../../../../../shared/components/FormDescriptions/GoogleSheetsServiceAccountDescription';

interface GoogleSheetsServiceAccountFieldProps {
  itemName: string;
  title?: string;
  description?: string;
  value?: unknown;
  metadata?: ServiceAccountMetadata;
  onValueChange: (value: string, metadata: ServiceAccountMetadata) => void;
  isEditingExisting: boolean;
}

interface ServiceAccountMetadata {
  email?: string;
  clientId?: string;
  projectId?: string;
}

function getMetadataFromJson(value: string): ServiceAccountMetadata {
  try {
    const parsed = JSON.parse(value) as {
      client_email?: unknown;
      client_id?: unknown;
      project_id?: unknown;
    };
    return {
      email: typeof parsed.client_email === 'string' ? parsed.client_email : undefined,
      clientId: typeof parsed.client_id === 'string' ? parsed.client_id : undefined,
      projectId: typeof parsed.project_id === 'string' ? parsed.project_id : undefined,
    };
  } catch {
    return {};
  }
}

function getLinkFromMetadata(metadata?: ServiceAccountMetadata) {
  if (!metadata?.email || !metadata.clientId || !metadata.projectId) {
    return null;
  }
  return {
    email: metadata.email,
    url: `https://console.cloud.google.com/iam-admin/serviceaccounts/details/${metadata.clientId}?project=${metadata.projectId}`,
  };
}

export function GoogleSheetsServiceAccountField({
  itemName,
  title,
  description,
  value,
  metadata,
  onValueChange,
  isEditingExisting,
}: GoogleSheetsServiceAccountFieldProps) {
  const serviceAccountValue = typeof value === 'string' ? value : '';
  const [isEditing, setIsEditing] = useState(false);
  const [stashedValue, setStashedValue] = useState(serviceAccountValue);
  const [stashedMetadata, setStashedMetadata] = useState<ServiceAccountMetadata>(metadata ?? {});
  const [copied, setCopied] = useState(false);

  const isMasked = serviceAccountValue === SECRET_MASK;
  const serviceAccountLink = serviceAccountValue && !isMasked
    ? getServiceAccountLink(serviceAccountValue)
    : getLinkFromMetadata(metadata);
  const canShowSavedState = !isEditing && (isMasked || serviceAccountLink);

  const handleEdit = () => {
    setStashedValue(serviceAccountValue);
    setStashedMetadata(metadata ?? {});
    setIsEditing(true);
    onValueChange('', metadata ?? {});
  };

  const handleCancel = () => {
    setIsEditing(false);
    onValueChange(stashedValue || (isEditingExisting ? SECRET_MASK : ''), stashedMetadata);
  };

  const handleServiceAccountChange = (nextValue: string) => {
    onValueChange(nextValue, getMetadataFromJson(nextValue));
  };

  const handleCopyEmail = () => {
    if (!serviceAccountLink) return;
    void navigator.clipboard.writeText(serviceAccountLink.email);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    <div className='mb-4'>
      <div className='flex items-center justify-between'>
        <AppWizardStepLabel
          htmlFor={itemName}
          required
          tooltip={description}
          className='mb-2 justify-start'
        >
          {title ?? 'Service Account'}
        </AppWizardStepLabel>
        {!isEditing && serviceAccountValue && (
          <Button variant='ghost' size='sm' type='button' onClick={handleEdit}>
            Edit
          </Button>
        )}
        {isEditing && (
          <Button variant='ghost' size='sm' type='button' onClick={handleCancel}>
            Cancel
          </Button>
        )}
      </div>

      {canShowSavedState ? (
        serviceAccountLink ? (
          <div className='flex items-center gap-2'>
            <ExternalAnchor href={serviceAccountLink.url} variant='field' className='flex-1 truncate'>
              {serviceAccountLink.email}
            </ExternalAnchor>
            <button
              type='button'
              onClick={handleCopyEmail}
              className='text-muted-foreground hover:text-foreground hover:bg-accent shrink-0 rounded-md p-1 transition-colors'
              aria-label='Copy email'
            >
              {copied ? (
                <Check className='h-4 w-4 text-green-500' />
              ) : (
                <Copy className='h-4 w-4' />
              )}
            </button>
          </div>
        ) : (
          <Input
            id={itemName}
            type='password'
            value={SECRET_MASK}
            readOnly
            disabled
            autoComplete='new-password'
          />
        )
      ) : (
        <FileDropTextarea
          id={itemName}
          name={itemName}
          className='min-h-[150px] font-mono'
          rows={8}
          value={serviceAccountValue === SECRET_MASK ? '' : serviceAccountValue}
          placeholder='Paste your service account JSON here or drag & drop the file'
          autoComplete='off'
          autoCorrect='off'
          autoCapitalize='off'
          spellCheck={false}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
            handleServiceAccountChange(event.target.value);
          }}
          onFileRead={content => {
            handleServiceAccountChange(content);
            setIsEditing(false);
          }}
          onFileReject={error => {
            toast.error(error);
          }}
        />
      )}

      <div className='mt-2'>
        <GoogleSheetsServiceAccountDescription />
      </div>
    </div>
  );
}

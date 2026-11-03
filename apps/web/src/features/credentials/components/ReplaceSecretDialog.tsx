import { Button } from '@owox/ui/components/button';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@owox/ui/components/dialog';
import { FileDropTextarea } from '@owox/ui/components/file-drop-textarea';
import { Input } from '@owox/ui/components/input';
import { Label } from '@owox/ui/components/label';
import { useId, useState } from 'react';
import toast from 'react-hot-toast';
import { safeCredentialDocumentationUrl } from '../credential-documentation-url';
import type { Credential } from '../types';
import { CredentialUsedByList } from './CredentialUsedByList';
import { SecretReplacementWarning } from './SecretReplacementWarning';

export function ReplaceSecretDialog({
  credential,
  isSaving,
  error,
  onOpenChange,
  onReplace,
}: {
  credential: Credential | null;
  isSaving: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onReplace: (secret: string) => Promise<void>;
}) {
  const [secret, setSecret] = useState('');
  const secretId = useId();
  const documentationUrl = safeCredentialDocumentationUrl(credential?.definition.documentationUrl);
  return (
    <Dialog open={credential !== null} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[90vh] flex-col'>
        <DialogHeader>
          <DialogTitle>Replace secret</DialogTitle>
          <DialogDescription>
            Consumers keep this Credential. They use the new secret on their next request.
          </DialogDescription>
        </DialogHeader>
        {/* Only the body scrolls. The buttons stay visible in a short window. */}
        <div className='-mx-6 -my-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-1'>
          {error && (
            <p role='alert' className='text-destructive text-sm'>
              {error}
            </p>
          )}
          {credential && credential.usedBy.length > 0 && (
            <CredentialUsedByList credential={credential} />
          )}
          {credential && <SecretReplacementWarning credential={credential} />}
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor={secretId}>New secret</Label>
            {credential?.definition.auth?.type === 'google-service-account' ? (
              <FileDropTextarea
                id={secretId}
                className='min-h-[150px] font-mono'
                rows={8}
                spellCheck={false}
                autoComplete='off'
                maxLength={32_768}
                value={secret}
                placeholder='Paste the service account JSON key or drop the file'
                onChange={event => {
                  setSecret(event.target.value);
                }}
                onFileRead={setSecret}
                onFileReject={message => {
                  toast.error(message);
                }}
              />
            ) : (
              <Input
                id={secretId}
                type='password'
                autoComplete='new-password'
                value={secret}
                onChange={event => {
                  setSecret(event.target.value);
                }}
                maxLength={32_768}
              />
            )}
            {documentationUrl && (
              <ExternalAnchor href={documentationUrl} className='w-fit text-sm'>
                How to get this key
              </ExternalAnchor>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button disabled={isSaving || !secret} onClick={() => void onReplace(secret)}>
            {isSaving ? 'Replacing…' : 'Replace secret'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@owox/ui/components/dialog';
import { Button } from '@owox/ui/components/button';
import { Alert, AlertDescription } from '@owox/ui/components/alert';
import { Label } from '@owox/ui/components/label';
import { Copy, Check, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import type { CreateProjectMemberApiKeyResponse } from '../types';

interface SecretRevealDialogProps {
  data: CreateProjectMemberApiKeyResponse | null;
  onDone: () => void;
}

export function SecretRevealDialog({ data, onDone }: SecretRevealDialogProps) {
  const [secretCopied, setSecretCopied] = useState(false);

  useEffect(() => {
    setSecretCopied(false);
  }, [data]);

  if (!data) return null;

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const handleCopySecret = async () => {
    await copyToClipboard(data.apiKeySecret, 'API Key Secret');
    setSecretCopied(true);
  };

  return (
    <Dialog
      open={!!data}
      onOpenChange={() => {
        /* intentionally empty — prevent closing */
      }}
    >
      <DialogContent
        className='sm:max-w-lg'
        onPointerDownOutside={e => {
          e.preventDefault();
        }}
        onEscapeKeyDown={e => {
          e.preventDefault();
        }}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>API Key Created</DialogTitle>
          <DialogDescription>Your new API key has been created successfully.</DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <Alert>
            <Info className='size-4' />
            <AlertDescription>
              Copy the secret now. You won&apos;t be able to see it again.
            </AlertDescription>
          </Alert>

          <div className='space-y-3'>
            <div>
              <Label className='text-muted-foreground mb-1 block text-xs'>API Key ID</Label>
              <div className='bg-muted flex items-center justify-between rounded-md px-3 py-2'>
                <code className='text-sm'>{data.apiKeyId}</code>
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-7'
                  onClick={() => {
                    void copyToClipboard(data.apiKeyId, 'API Key ID');
                  }}
                >
                  <Copy className='size-3.5' />
                </Button>
              </div>
            </div>

            <div>
              <Label className='text-muted-foreground mb-1 block text-xs'>API Key Secret</Label>
              <div className='bg-muted flex items-center justify-between rounded-md px-3 py-2'>
                <code className='text-sm break-all'>{data.apiKeySecret}</code>
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-7'
                  onClick={() => {
                    void handleCopySecret();
                  }}
                >
                  {secretCopied ? (
                    <Check className='size-3.5 text-green-600' />
                  ) : (
                    <Copy className='size-3.5' />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onDone}>I have saved the secret</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

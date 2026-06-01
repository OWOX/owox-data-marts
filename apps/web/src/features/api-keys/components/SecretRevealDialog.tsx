import { useEffect, useId, useRef, useState } from 'react';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Copy, ExternalLink, Eye, EyeOff, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { useFlags } from '../../../app/store/hooks/useFlags';
import type { CreateProjectMemberApiKeyResponse } from '../types';

interface SecretRevealDialogProps {
  data: CreateProjectMemberApiKeyResponse | null;
  onDone: () => void;
}

const API_KEYS_DOCS_URL = 'https://docs.owox.com/docs/api/api-keys/';
const SECRET_NOTICE = "Copy the secret now. You won't be able to see it again.";

export function SecretRevealDialog({ data, onDone }: SecretRevealDialogProps) {
  const apiOriginInputId = useId();
  const apiKeySecretInputId = useId();
  const apiKeySecretNoticeId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [secretVisible, setSecretVisible] = useState(false);
  const { flags } = useFlags();

  useEffect(() => {
    setSecretVisible(false);
  }, [data?.apiKeySecret]);

  if (!data) return null;

  const apiOrigin = flags?.PUBLIC_ORIGIN as string;

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
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
        onOpenAutoFocus={e => {
          e.preventDefault();
          titleRef.current?.focus({ preventScroll: true });
        }}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle ref={titleRef} tabIndex={-1} className='focus:outline-none'>
            API Key Created
          </DialogTitle>
          <DialogDescription>Your new API key has been created successfully.</DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-3'>
            <div className='group'>
              <div className='text-muted-foreground mb-1 flex items-center justify-between gap-2 text-xs font-medium'>
                <Label htmlFor={apiOriginInputId}>API Origin</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type='button'
                      tabIndex={-1}
                      className='pointer-events-none opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100'
                      aria-label='Help information'
                    >
                      <Info
                        className='text-muted-foreground/50 hover:text-muted-foreground size-4 shrink-0 transition-colors'
                        aria-hidden='true'
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side='top' align='center' role='tooltip'>
                    Base URL for API requests from external tools.
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className='bg-muted flex items-center justify-between gap-2 rounded-md px-3 py-2'>
                <input
                  id={apiOriginInputId}
                  value={apiOrigin}
                  readOnly
                  tabIndex={-1}
                  className='min-w-0 flex-1 bg-transparent font-mono text-sm outline-none'
                />
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-7'
                  aria-label='Copy API Origin'
                  onClick={() => {
                    void copyToClipboard(apiOrigin, 'API Origin');
                  }}
                >
                  <Copy className='size-3.5' />
                </Button>
              </div>
            </div>

            <div className='group'>
              <div className='text-muted-foreground mb-1 flex items-center justify-between gap-2 text-xs font-medium'>
                <Label>API Key ID</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type='button'
                      tabIndex={-1}
                      className='pointer-events-none opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100'
                      aria-label='Help information'
                    >
                      <Info
                        className='text-muted-foreground/50 hover:text-muted-foreground size-4 shrink-0 transition-colors'
                        aria-hidden='true'
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side='top' align='center' role='tooltip'>
                    Public identifier for this API key.
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className='bg-muted flex items-center justify-between gap-2 rounded-md px-3 py-2'>
                <code className='text-sm'>{data.apiKeyId}</code>
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-7'
                  aria-label='Copy API Key ID'
                  onClick={() => {
                    void copyToClipboard(data.apiKeyId, 'API Key ID');
                  }}
                >
                  <Copy className='size-3.5' />
                </Button>
              </div>
            </div>

            <div className='group'>
              <div className='text-muted-foreground mb-1 flex items-center justify-between gap-2 text-xs font-medium'>
                <Label htmlFor={apiKeySecretInputId}>API Key Secret</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type='button'
                      tabIndex={-1}
                      className='pointer-events-none opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100'
                      aria-label='Help information'
                    >
                      <Info
                        className='text-muted-foreground/50 hover:text-muted-foreground size-4 shrink-0 transition-colors'
                        aria-hidden='true'
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side='top' align='center' role='tooltip'>
                    Secret credential shown only once. Store it securely.
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className='bg-muted flex items-center justify-between gap-2 rounded-md px-3 py-2'>
                <input
                  id={apiKeySecretInputId}
                  value={data.apiKeySecret}
                  readOnly
                  tabIndex={-1}
                  type={secretVisible ? 'text' : 'password'}
                  aria-describedby={apiKeySecretNoticeId}
                  autoComplete='off'
                  spellCheck={false}
                  className='min-w-0 flex-1 bg-transparent font-mono text-sm outline-none'
                />
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-7'
                  aria-label={secretVisible ? 'Hide API Key Secret' : 'Show API Key Secret'}
                  onClick={() => {
                    setSecretVisible(isVisible => !isVisible);
                  }}
                >
                  {secretVisible ? <EyeOff className='size-3.5' /> : <Eye className='size-3.5' />}
                </Button>
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-7'
                  aria-label='Copy API Key Secret'
                  onClick={() => {
                    void copyToClipboard(data.apiKeySecret, 'API Key Secret');
                  }}
                >
                  <Copy className='size-3.5' />
                </Button>
              </div>
              <Alert className='mt-2 px-3 py-2'>
                <Info className='size-4' />
                <AlertDescription id={apiKeySecretNoticeId}>{SECRET_NOTICE}</AlertDescription>
              </Alert>
            </div>
          </div>
        </div>

        <DialogFooter className='items-center sm:justify-between'>
          <a
            href={API_KEYS_DOCS_URL}
            target='_blank'
            rel='noopener noreferrer'
            className='text-muted-foreground focus-visible:ring-ring/50 inline-flex h-9 items-center rounded-sm px-0 text-sm font-medium underline transition-colors focus-visible:ring-2 focus-visible:outline-none'
          >
            <span className='truncate'>API Keys documentation</span>
            <ExternalLink className='ml-2 h-3 w-3 shrink-0' aria-hidden='true' />
          </a>
          <Button onClick={onDone}>I have saved the secret</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

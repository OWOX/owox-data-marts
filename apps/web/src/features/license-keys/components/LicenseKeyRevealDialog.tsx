import { useEffect, useId, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@owox/ui/components/dialog';
import { Button } from '@owox/ui/components/button';
import { Alert, AlertDescription } from '@owox/ui/components/alert';
import { Label } from '@owox/ui/components/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Copy, Eye, EyeOff, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import type { CreateLicenseKeyResponse } from '../types';

interface LicenseKeyRevealDialogProps {
  data: CreateLicenseKeyResponse | null;
  onDone: () => void;
}

const SECRET_NOTICE = "Copy the license key now. You won't be able to see it again.";

export function LicenseKeyRevealDialog({ data, onDone }: LicenseKeyRevealDialogProps) {
  const licenseKeyInputId = useId();
  const licenseKeyNoticeId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [licenseKeyVisible, setLicenseKeyVisible] = useState(false);

  useEffect(() => {
    setLicenseKeyVisible(false);
  }, [data?.licenseKey]);

  if (!data) return null;

  return (
    <Dialog
      open={true}
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
            License key created
          </DialogTitle>
          <DialogDescription>
            Set this value as <code>LICENSE_KEY</code> on the deployment served at{' '}
            <strong>{data.origin}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className='group'>
          <div className='text-muted-foreground mb-1 flex items-center justify-between gap-2 text-xs font-medium'>
            <Label htmlFor={licenseKeyInputId}>License key</Label>
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
                Full signed license. Store it securely.
              </TooltipContent>
            </Tooltip>
          </div>
          <div className='bg-muted flex items-center justify-between gap-2 rounded-md px-3 py-2'>
            <input
              id={licenseKeyInputId}
              value={data.licenseKey}
              readOnly
              tabIndex={-1}
              type={licenseKeyVisible ? 'text' : 'password'}
              aria-describedby={licenseKeyNoticeId}
              autoComplete='off'
              spellCheck={false}
              className='min-w-0 flex-1 bg-transparent font-mono text-sm outline-none'
            />
            <Button
              variant='ghost'
              size='icon'
              className='size-7'
              aria-label={licenseKeyVisible ? 'Hide license key' : 'Show license key'}
              onClick={() => {
                setLicenseKeyVisible(isVisible => !isVisible);
              }}
            >
              {licenseKeyVisible ? <EyeOff className='size-3.5' /> : <Eye className='size-3.5' />}
            </Button>
            <Button
              variant='ghost'
              size='icon'
              className='size-7'
              aria-label='Copy license key'
              onClick={() => {
                void navigator.clipboard.writeText(data.licenseKey).then(() => {
                  toast.success('License key copied');
                });
              }}
            >
              <Copy className='size-3.5' />
            </Button>
          </div>
          <Alert className='mt-2 px-3 py-2'>
            <Info className='size-4' />
            <AlertDescription id={licenseKeyNoticeId}>{SECRET_NOTICE}</AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button onClick={onDone}>I have saved the license key</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

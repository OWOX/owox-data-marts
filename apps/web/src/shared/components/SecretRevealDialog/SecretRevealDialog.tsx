import { useId, useRef, useState, type ReactNode } from 'react';
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
import { Copy, ExternalLink, Eye, EyeOff, Info } from 'lucide-react';
import toast from 'react-hot-toast';

interface SecretRevealDialogProps {
  title: string;
  description: ReactNode;
  label: string;
  labelTooltip: string;
  secret: string;
  notice: string;
  confirmLabel: string;
  docsLink?: { href: string; label: string };
  onDone: () => void;
}

export function SecretRevealDialog({
  title,
  description,
  label,
  labelTooltip,
  secret,
  notice,
  confirmLabel,
  docsLink,
  onDone,
}: SecretRevealDialogProps) {
  const inputId = useId();
  const noticeId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [secretVisible, setSecretVisible] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard
      .writeText(secret)
      .then(() => toast.success(`${label} copied`))
      .catch(() => toast.error(`Failed to copy ${label}`));
  };

  return (
    <Dialog open>
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
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className='group'>
          <div className='text-muted-foreground mb-1 flex items-center justify-between gap-2 text-xs font-medium'>
            <Label htmlFor={inputId}>{label}</Label>
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
                {labelTooltip}
              </TooltipContent>
            </Tooltip>
          </div>
          <div className='bg-muted flex items-center justify-between gap-2 rounded-md px-3 py-2'>
            <input
              id={inputId}
              value={secret}
              readOnly
              tabIndex={-1}
              type={secretVisible ? 'text' : 'password'}
              aria-describedby={noticeId}
              autoComplete='off'
              spellCheck={false}
              className='min-w-0 flex-1 bg-transparent font-mono text-sm outline-none'
            />
            <Button
              variant='ghost'
              size='icon'
              className='size-7'
              aria-label={secretVisible ? `Hide ${label}` : `Show ${label}`}
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
              aria-label={`Copy ${label}`}
              onClick={copyToClipboard}
            >
              <Copy className='size-3.5' />
            </Button>
          </div>
          <Alert className='mt-2 px-3 py-2'>
            <Info className='size-4' />
            <AlertDescription id={noticeId}>{notice}</AlertDescription>
          </Alert>
        </div>

        <DialogFooter className={docsLink ? 'items-center sm:justify-between' : undefined}>
          {docsLink ? (
            <a
              href={docsLink.href}
              target='_blank'
              rel='noopener noreferrer'
              className='text-muted-foreground focus-visible:ring-ring/50 inline-flex h-9 items-center rounded-sm px-0 text-sm font-medium underline transition-colors focus-visible:ring-2 focus-visible:outline-none'
            >
              <span className='truncate'>{docsLink.label}</span>
              <ExternalLink className='ml-2 h-3 w-3 shrink-0' aria-hidden='true' />
            </a>
          ) : null}
          <Button onClick={onDone}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

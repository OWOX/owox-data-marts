import { useState } from 'react';
import { Check, Link } from 'lucide-react';
import {
  SheetHeaderAction,
  SheetHeaderActionButton,
} from '@owox/ui/components/common/sheet-header-action';

interface CopyLinkButtonProps {
  link: string;
  ariaLabel: string;
}

export function CopyLinkButton({ link, ariaLabel }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard
      .writeText(link)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err: unknown) => {
        console.error('Failed to copy link: ', err);
      });
  };

  return (
    <SheetHeaderAction>
      <SheetHeaderActionButton tabIndex={-1} onClick={handleCopy} aria-label={ariaLabel}>
        {copied ? (
          <>
            <Check className='h-3.5 w-3.5' /> Copied!
          </>
        ) : (
          <>
            <Link className='h-3.5 w-3.5' /> Copy link
          </>
        )}
      </SheetHeaderActionButton>
    </SheetHeaderAction>
  );
}

export default CopyLinkButton;

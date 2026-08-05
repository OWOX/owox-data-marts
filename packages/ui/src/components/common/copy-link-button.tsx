import { useState } from 'react';
import { Check, Link } from 'lucide-react';

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
    <div className='border-border border-l pl-2'>
      <button
        tabIndex={-1}
        type='button'
        onClick={handleCopy}
        className='text-muted-foreground hover:bg-muted hover:text-foreground -my-1.5 flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors'
        aria-label={ariaLabel}
      >
        {copied ? (
          <>
            <Check className='h-3.5 w-3.5' /> Copied!
          </>
        ) : (
          <>
            <Link className='h-3.5 w-3.5' /> Copy link
          </>
        )}
      </button>
    </div>
  );
}

export default CopyLinkButton;

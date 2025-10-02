import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@owox/ui/components/button';

interface CopyToClipboardButtonProps {
  content: string;
  buttonText?: string;
  copiedText?: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export function CopyToClipboardButton({
  content,
  buttonText = 'Copy',
  copiedText = 'Copied',
  variant = 'outline',
  size = 'sm',
  className = 'flex items-center gap-2',
}: CopyToClipboardButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button type='button' variant={variant} size={size} className={className} onClick={handleCopy}>
      {copied ? (
        <>
          <Check className='h-4 w-4' />
          {copiedText}
        </>
      ) : (
        <>
          <Copy className='h-4 w-4' />
          {buttonText}
        </>
      )}
    </Button>
  );
}

export default CopyToClipboardButton;

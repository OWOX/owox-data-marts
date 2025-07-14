import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
  text: string;
  section: string;
  variant?: 'error' | 'default';
  copiedSection: string | null;
  onCopy: (text: string, section: string) => void;
  iconOnly?: boolean;
}

export function CopyButton({
  text,
  section,
  variant = 'default',
  copiedSection,
  onCopy,
  iconOnly = false,
}: CopyButtonProps) {
  const isError = variant === 'error';
  const isCopied = copiedSection === section;

  const baseClasses =
    'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors cursor-pointer';
  const variantClasses = isError
    ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40'
    : 'text-foreground hover:bg-muted';

  return (
    // No use of lib button here, because styles are not applied correctly
    <button
      onClick={e => {
        onCopy(text, section);
        e.stopPropagation();
      }}
      className={`${baseClasses} ${variantClasses}`}
      title={`Copy ${section} to clipboard`}
    >
      {iconOnly ? (
        <>{isCopied ? <Check className='h-3 w-3' /> : <Copy className='h-3 w-3' />}</>
      ) : isCopied ? (
        <>
          <Check className='h-3 w-3' />
          Copied
        </>
      ) : (
        <>
          <Copy className='h-3 w-3' />
          Copy
        </>
      )}
    </button>
  );
}

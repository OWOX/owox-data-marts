import { Check, Copy, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { useClipboard } from '../../../../../../hooks/useClipboard';

const inlineIconButton =
  'text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 ml-1 inline-flex size-[22px] items-center justify-center rounded-sm align-middle outline-none focus-visible:ring-[3px] -mb-[1px] shrink-0 transition-colors';

interface CopyValueButtonProps {
  value: string;
  /** Accessible name, e.g. "Copy full table name". */
  label: string;
}

/** Inline icon button that copies `value` and briefly shows a check mark. */
export function CopyValueButton({ value, label }: CopyValueButtonProps) {
  const { copiedSection, handleCopy } = useClipboard();
  const copied = copiedSection === value;

  // TooltipTrigger renders the <button> itself. `type` stays explicit: the block lives
  // inside a form, where a button without a type would submit it.
  return (
    <Tooltip>
      <TooltipTrigger
        type='button'
        aria-label={label}
        className={inlineIconButton}
        onClick={() => {
          handleCopy(value, value);
        }}
      >
        {copied ? <Check className='size-3.5' /> : <Copy className='size-3.5' />}
      </TooltipTrigger>
      <TooltipContent>{copied ? 'Copied' : `Copy ${value}`}</TooltipContent>
    </Tooltip>
  );
}

/** Focusable info icon with an explanatory tooltip. */
export function InfoHint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger type='button' aria-label={text} className={inlineIconButton}>
        <Info className='size-3.5' />
      </TooltipTrigger>
      <TooltipContent className='max-w-xs'>{text}</TooltipContent>
    </Tooltip>
  );
}

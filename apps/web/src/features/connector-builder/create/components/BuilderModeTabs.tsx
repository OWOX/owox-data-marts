import { cn } from '@owox/ui/lib/utils';

/**
 * Builder / Code switch. It heads the left configuration column in Builder mode
 * (above "Global configuration") and the editor column in Code mode, so it stays
 * reachable in both modes without living in the top bar.
 */
export function BuilderModeTabs({
  mode,
  onSetMode,
}: {
  mode: 'builder' | 'code';
  onSetMode: (m: 'builder' | 'code') => void;
}) {
  return (
    <div
      className='flex h-[44px] flex-none items-stretch gap-4 border-b px-4'
      role='group'
      aria-label='Editor mode'
    >
      {(['builder', 'code'] as const).map(m => (
        <button
          key={m}
          type='button'
          onClick={() => {
            onSetMode(m);
          }}
          aria-pressed={mode === m}
          data-testid={`mode-${m}`}
          className={cn(
            'flex items-center border-b-2 text-[13px] capitalize',
            mode === m
              ? 'border-primary text-foreground font-medium'
              : 'text-muted-foreground border-transparent'
          )}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

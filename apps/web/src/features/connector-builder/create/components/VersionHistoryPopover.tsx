import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { Button } from '@owox/ui/components/button';
import { cn } from '@owox/ui/lib/utils';
import { ConfirmationDialog } from '../../../../shared/components/ConfirmationDialog';
import { useBuilder } from '../../shared/model/hooks/useBuilder';

export function VersionHistoryPopover() {
  const { state, loadVersion, activateVersion } = useBuilder();
  const { versions, activeVersion, loadedVersion } = state;
  const [open, setOpen] = useState(false);
  const [pendingVersion, setPendingVersion] = useState<number | null>(null);
  // .at() is typed as possibly-undefined, so the empty-history guard below holds.
  const shown = versions.find(v => v.version === loadedVersion) ?? versions.at(-1);
  if (!shown) return null;

  const rows = [...versions].reverse(); // newest first

  // Open a version, but if there are unsaved edits, confirm first (opening
  // replaces the editor manifest, discarding the in-progress draft edits).
  const openVersion = (version: number) => {
    if (version === loadedVersion) {
      setOpen(false);
      return;
    }
    if (state.dirty) {
      setPendingVersion(version);
    } else {
      setOpen(false);
      void loadVersion(version);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type='button'
            data-testid='version-badge'
            aria-label='Version history'
            className='bg-accent text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs'
          >
            <span
              className={cn(
                'h-[7px] w-[7px] rounded-full',
                shown.status === 'published' ? 'bg-[#22c55e]' : 'bg-muted-foreground/50'
              )}
            />
            v{shown.version} · {shown.status}
          </button>
        </PopoverTrigger>
        <PopoverContent align='end' className='w-72 p-0' data-testid='version-history'>
          <div className='text-muted-foreground border-b px-3 py-2 text-[11px] font-medium'>
            Version history
          </div>
          <ul className='max-h-72 overflow-auto py-1'>
            {rows.map(v => (
              <li
                key={v.version}
                className='flex items-center gap-2 px-3 py-1.5'
                data-testid={`version-row-${v.version}`}
              >
                <button
                  type='button'
                  onClick={() => {
                    openVersion(v.version);
                  }}
                  className='flex flex-1 items-center gap-2 text-left'
                >
                  <span
                    className={cn(
                      'h-[7px] w-[7px] rounded-full',
                      v.status === 'published' ? 'bg-[#22c55e]' : 'bg-muted-foreground/50'
                    )}
                  />
                  <span className='text-foreground text-[13px]'>v{v.version}</span>
                  <span className='text-muted-foreground text-[11px]'>{v.status}</span>
                  {v.version === activeVersion && (
                    <span className='rounded bg-emerald-50 px-1.5 text-[10px] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'>
                      active
                    </span>
                  )}
                  {v.version === loadedVersion && (
                    <span className='bg-accent text-muted-foreground rounded px-1.5 text-[10px]'>
                      viewing
                    </span>
                  )}
                </button>
                {v.status === 'published' && v.version !== activeVersion && (
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    aria-label={`Make version ${v.version} active`}
                    onClick={() => void activateVersion(v.version)}
                    className='h-6 px-2 text-[11px]'
                  >
                    Make active
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>

      <ConfirmationDialog
        open={pendingVersion !== null}
        onOpenChange={open => {
          if (!open) setPendingVersion(null);
        }}
        title='Discard changes & open version'
        description={
          <p className='mt-2'>
            You have unsaved changes. Opening version {pendingVersion} will discard them. This can't
            be undone.
          </p>
        }
        confirmLabel='Discard & open'
        cancelLabel='Cancel'
        variant='destructive'
        onConfirm={() => {
          const v = pendingVersion;
          setPendingVersion(null);
          if (v !== null) void loadVersion(v);
        }}
      />
    </>
  );
}

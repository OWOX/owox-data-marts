import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { ConfirmationDialog } from '../../../../shared/components/ConfirmationDialog';
import { useBuilder } from '../../shared/model/hooks/useBuilder';
import { firstNonEmpty } from '../../shared/model/asText';
import { VersionHistoryPopover } from './VersionHistoryPopover';
export function BuilderTopBar({
  onToggleTest,
  onBack,
  onToggleAi,
}: {
  onToggleTest: () => void;
  onBack?: () => void;
  onToggleAi?: () => void;
}) {
  const { manifest, state, saveDraft, publish, softDelete, reset } = useBuilder();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  return (
    <div
      className='bg-card relative flex h-[52px] flex-none items-center gap-2.5 border-b pr-4 pl-2.5'
      data-testid='builder-topbar'
    >
      {onBack && (
        <Button
          variant='ghost'
          size='icon'
          onClick={onBack}
          aria-label='Back'
          data-testid='builder-back'
          className='text-muted-foreground h-[30px] w-[30px]'
        >
          <ChevronLeft className='h-[18px] w-[18px]' />
        </Button>
      )}

      {/* Breadcrumb */}
      <div className='ml-1 flex items-center gap-1.5 text-[13px]'>
        <span className='text-muted-foreground'>Connectors</span>
        <ChevronRight className='text-muted-foreground h-3.5 w-3.5' />
        <span className='text-foreground max-w-[200px] truncate font-medium'>
          {manifest.name || 'New connector'}
        </span>
      </div>

      {/* Build with AI — centered feature action */}
      {onToggleAi && (
        <div className='absolute left-1/2 -translate-x-1/2'>
          <Button variant='outline' size='sm' onClick={onToggleAi} className='gap-1.5'>
            <Sparkles className='h-3.5 w-3.5' />
            Build with AI
          </Button>
        </div>
      )}

      {/* Right group */}
      <div className='ml-auto flex items-center gap-2.5'>
        <Button
          variant='ghost'
          onClick={onToggleTest}
          data-testid='open-test'
          className='text-muted-foreground h-8 gap-1.5'
        >
          <Play className='h-3.5 w-3.5' />
          Test
        </Button>

        <VersionHistoryPopover />

        <Button
          variant='ghost'
          onClick={() => void saveDraft()}
          disabled={state.saving || !state.dirty}
          className='text-muted-foreground h-8'
        >
          {state.saving ? 'Saving…' : 'Save draft'}
        </Button>

        <Button
          onClick={() => void publish()}
          disabled={state.saving || state.publishing}
          className='h-8 rounded-full'
        >
          {state.publishing ? 'Publishing…' : 'Publish'}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              size='icon'
              aria-label='More actions'
              data-testid='builder-more'
              className='text-muted-foreground h-[30px] w-[30px]'
            >
              <MoreVertical className='h-[18px] w-[18px]' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem
              data-testid='builder-reset'
              disabled={!state.dirty}
              onClick={() => {
                setResetOpen(true);
              }}
            >
              <RotateCcw className='h-4 w-4' />
              <span>Discard changes</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-testid='builder-delete'
              disabled={!state.id}
              onClick={() => {
                setDeleteOpen(true);
              }}
            >
              <Trash2 className='h-4 w-4 text-red-600' />
              <span className='text-red-600'>Delete connector</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ConfirmationDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title='Discard changes'
        description={
          <p className='mt-2'>
            Discard all unsaved changes and restore the last saved state? This can't be undone.
          </p>
        }
        confirmLabel='Discard'
        cancelLabel='Cancel'
        variant='destructive'
        onConfirm={() => {
          void (async () => {
            await reset();
            setResetOpen(false);
          })();
        }}
      />

      <ConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title='Delete connector'
        description={
          <p className='mt-2 break-words'>
            Are you sure you want to delete "
            <span className='font-semibold [overflow-wrap:anywhere]'>
              {firstNonEmpty(manifest.title, manifest.name, 'this connector')}
            </span>
            "? Data marts already using it keep working, but it can no longer be selected.
          </p>
        }
        confirmLabel='Delete'
        cancelLabel='Cancel'
        variant='destructive'
        onConfirm={() => {
          void (async () => {
            const ok = await softDelete();
            setDeleteOpen(false);
            if (ok) onBack?.();
          })();
        }}
      />
    </div>
  );
}

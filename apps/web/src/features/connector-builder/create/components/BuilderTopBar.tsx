import { useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  MoreVertical,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { ConfirmationDialog } from '../../../../shared/components/ConfirmationDialog';
import { draftVersionAtRisk, useBuilder } from '../../shared/model/hooks/useBuilder';
import { firstNonEmpty } from '../../shared/model/asText';
import { manifestToJson, parseManifestJson } from '../../shared/model/manifestJson';
import type { BuilderManifest } from '../../shared/model/manifest.types';
import { downloadBlob } from '../../../data-marts/model-canvas/export/download';
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
  const { manifest, state, saveDraft, publish, softDelete, reset, setManifest } = useBuilder();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<BuilderManifest | null>(null);

  const exportManifest = () => {
    downloadBlob(
      new Blob([manifestToJson(manifest)], { type: 'application/json' }),
      `${manifest.name || 'connector'}.json`
    );
  };

  const applyImport = (imported: BuilderManifest) => {
    // Data marts reference an existing connector by its name, so an import cannot change it.
    const keepName = state.id !== null && imported.name !== manifest.name;
    setManifest(keepName ? { ...imported, name: manifest.name } : imported);
    toast.success(
      keepName
        ? `Manifest imported. The connector name stays "${manifest.name}".`
        : 'Manifest imported'
    );
  };

  const importFile = async (file: File) => {
    const parsed = parseManifestJson(await file.text());
    if (!parsed.ok) {
      toast.error(`Could not import ${file.name}: ${parsed.error}`);
      return;
    }
    if (state.dirty) setPendingImport(parsed.manifest);
    else applyImport(parsed.manifest);
  };
  // Which write is waiting on the "this replaces a newer draft" confirmation, if any.
  // Publish is guarded too: it saves the draft first, so it destroys the same row.
  const [pendingWrite, setPendingWrite] = useState<'save' | 'publish' | null>(null);
  const atRisk = draftVersionAtRisk(state);
  const write = (kind: 'save' | 'publish') => {
    if (atRisk !== null) setPendingWrite(kind);
    else if (kind === 'save') void saveDraft();
    else void publish();
  };

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
          onClick={() => {
            write('save');
          }}
          disabled={state.saving || state.codeInvalid || !state.dirty}
          className='text-muted-foreground h-8'
        >
          {state.saving ? 'Saving…' : 'Save draft'}
        </Button>

        <Button
          onClick={() => {
            write('publish');
          }}
          // Both writes send `state.manifest`, which is the last text Code mode managed to
          // parse — publishing while the buffer does not parse ships a manifest missing
          // everything typed since, and says "Published". No explanation is needed on the
          // buttons: an unparseable buffer only exists in Code mode, where the parse error
          // is on screen above the editor.
          disabled={state.saving || state.publishing || state.codeInvalid}
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
              data-testid='builderImportJson'
              onClick={() => {
                importInputRef.current?.click();
              }}
            >
              <Upload className='h-4 w-4' />
              <span>Import JSON…</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid='builderExportJson'
              disabled={state.codeInvalid}
              onClick={exportManifest}
            >
              <Download className='h-4 w-4' />
              <span>Export JSON</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
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
        <input
          ref={importInputRef}
          type='file'
          accept='.json,application/json'
          className='hidden'
          data-testid='builderImportInput'
          onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void importFile(file);
          }}
        />
      </div>

      <ConfirmationDialog
        open={pendingImport !== null}
        onOpenChange={open => {
          if (!open) setPendingImport(null);
        }}
        title='Replace unsaved changes?'
        description={
          <p className='mt-2'>
            The imported manifest replaces your unsaved changes. Nothing is saved until you save the
            draft or publish.
          </p>
        }
        confirmLabel='Import'
        cancelLabel='Cancel'
        variant='destructive'
        onConfirm={() => {
          const next = pendingImport;
          setPendingImport(null);
          if (next) applyImport(next);
        }}
      />

      <ConfirmationDialog
        open={pendingWrite !== null}
        onOpenChange={open => {
          if (!open) setPendingWrite(null);
        }}
        title='Replace the newest draft?'
        description={
          <p className='mt-2'>
            You're editing version {state.loadedVersion}, but version {atRisk} is a newer draft.
            Saving writes over version {atRisk}, and its contents can't be recovered.
          </p>
        }
        confirmLabel={pendingWrite === 'publish' ? 'Replace & publish' : 'Replace draft'}
        cancelLabel='Cancel'
        variant='destructive'
        onConfirm={() => {
          const kind = pendingWrite;
          setPendingWrite(null);
          if (kind === 'save') void saveDraft();
          else if (kind === 'publish') void publish();
        }}
      />

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

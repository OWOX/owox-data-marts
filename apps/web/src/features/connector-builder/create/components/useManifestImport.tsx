import { useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { ConfirmationDialog } from '../../../../shared/components/ConfirmationDialog';
import { useBuilder } from '../../shared/model/hooks/useBuilder';
import { parseManifestJson } from '../../shared/model/manifestJson';
import type { BuilderManifest } from '../../shared/model/manifest.types';
import { trackCustomConnectorEvent } from '../../shared/model/analytics';

/** Where the import was started, for analytics. */
export type ImportSource = 'menu' | 'code_tab';

/**
 * Importing a manifest from a JSON file. The builder renders `elements` once and hands
 * `openFilePicker` to every place that offers the import, so they share one file input
 * and one confirmation.
 */
export function useManifestImport({ onImported }: { onImported?: () => void } = {}) {
  const { manifest, state, setManifest } = useBuilder();
  const inputRef = useRef<HTMLInputElement>(null);
  const source = useRef<ImportSource>('menu');
  const [pendingImport, setPendingImport] = useState<BuilderManifest | null>(null);

  const applyImport = (imported: BuilderManifest) => {
    // Data marts reference an existing connector by its name, so an import cannot change it.
    const keepName = state.id !== null && imported.name !== manifest.name;
    const next = keepName ? { ...imported, name: manifest.name } : imported;
    setManifest(next);
    toast.success(
      keepName
        ? `Manifest imported. The connector name stays "${manifest.name}".`
        : 'Manifest imported'
    );
    onImported?.();
    trackCustomConnectorEvent(
      'custom_connector_imported',
      { id: state.id, manifest: next },
      { where: source.current, result: 'success' }
    );
  };

  const importFile = async (file: File) => {
    const parsed = parseManifestJson(await file.text());
    if (!parsed.ok) {
      toast.error(`Could not import ${file.name}: ${parsed.error}`);
      trackCustomConnectorEvent(
        'custom_connector_imported',
        { id: state.id, manifest },
        { where: source.current, result: 'invalid' }
      );
      return;
    }
    if (state.dirty) setPendingImport(parsed.manifest);
    else applyImport(parsed.manifest);
  };

  const elements = (
    <>
      <input
        ref={inputRef}
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
    </>
  );

  return {
    openFilePicker: (from: ImportSource) => {
      source.current = from;
      inputRef.current?.click();
    },
    elements,
  };
}

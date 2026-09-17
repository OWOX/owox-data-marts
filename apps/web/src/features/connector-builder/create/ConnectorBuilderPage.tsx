import { useEffect, useRef, useState } from 'react';
import { BuilderProvider } from '../shared/model/context/BuilderProvider';
import { useBuilder } from '../shared/model/hooks/useBuilder';
import { BuilderTopBar } from './components/BuilderTopBar';
import { BuilderModeTabs } from './components/BuilderModeTabs';
import { BuilderNavRail, type BuilderSelection } from './components/BuilderNavRail';
import { GeneralEditor } from './components/GeneralEditor';
import { ParametersEditor } from './components/ParametersEditor';
import { AuthenticationEditor } from './components/AuthenticationEditor';
import { NodeEditor } from './components/node/NodeEditor';
import { NodeEditorBoundary } from './components/node/NodeEditorBoundary';
import { ResultsDock } from './components/ResultsDock';
import { CodeModeEditor } from './components/CodeModeEditor';
import { ConfirmationDialog } from '../../../shared/components/ConfirmationDialog';

function BuilderCenter({
  selection,
  onSelect,
}: {
  selection: BuilderSelection;
  onSelect: (s: BuilderSelection) => void;
}) {
  const { manifest } = useBuilder();
  let content;
  if (selection.kind === 'node' && selection.name in manifest.nodes) {
    // Only the node pane is wrapped: the top bar, the nav rail and the Builder/Code switch
    // are mounted above this and stay usable, so a node the form cannot render is still
    // repairable in Code mode.
    content = (
      <NodeEditorBoundary nodeName={selection.name}>
        <NodeEditor
          // Remount on every node switch. Parts of the node pane are uncontrolled
          // (`defaultValue` on the path inputs, which cannot be controlled while a
          // half-typed value has nothing to persist to), and PaginationEditor reads the
          // stop-condition path back out of the DOM to write it atomically with `equals`.
          // Updating in place would leave the previous node's DOM values in those inputs
          // and let one node's path be written into another's manifest.
          key={selection.name}
          nodeName={selection.name}
          onRemoved={() => {
            const remaining = Object.keys(manifest.nodes).filter(n => n !== selection.name);
            onSelect(
              remaining[0]
                ? { kind: 'node', name: remaining[0] }
                : { kind: 'global', section: 'general' }
            );
          }}
          onRenamed={newName => {
            onSelect({ kind: 'node', name: newName });
          }}
          onCloned={newName => {
            onSelect({ kind: 'node', name: newName });
          }}
        />
      </NodeEditorBoundary>
    );
  } else if (selection.kind === 'global' && selection.section === 'parameters') {
    content = <ParametersEditor />;
  } else if (selection.kind === 'global' && selection.section === 'authentication') {
    content = <AuthenticationEditor />;
  } else {
    content = <GeneralEditor />;
  }
  // The editor blocks sit on muted CollapsibleCards; force form controls to a solid white
  // surface so transparent inputs/selects/textarea don't read as grey through the card.
  return (
    <div
      data-testid='builder-center'
      className='[&_[data-slot=select-trigger]]:bg-card [&_input]:bg-card [&_textarea]:bg-card'
    >
      {content}
    </div>
  );
}

function BuilderShell({
  id,
  onBack,
  onCreated,
  onDirtyChange,
}: {
  id?: string;
  onBack?: () => void;
  onCreated?: (id: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { state, manifest, addNode, cloneNode, initNew, loadConnector, setCodeInvalid } =
    useBuilder();
  const [selection, setSelection] = useState<BuilderSelection>({
    kind: 'global',
    section: 'general',
  });
  const [dockOpen, setDockOpen] = useState(false);
  const [mode, setMode] = useState<'builder' | 'code'>('builder');
  const [confirmDropCode, setConfirmDropCode] = useState(false);
  const announcedCreate = useRef(false);

  // Leaving Code mode unmounts the editor, and its buffer with it. Anything that parsed is
  // pushed on the way out, so the only thing at stake is text that does not — which is
  // exactly what the author is in the middle of fixing. Ask rather than drop it silently.
  const requestMode = (next: 'builder' | 'code') => {
    if (next === 'builder' && state.codeInvalid) setConfirmDropCode(true);
    else setMode(next);
  };

  useEffect(() => {
    if (id) void loadConnector(id);
    else initNew();
  }, [id, initNew, loadConnector]);

  // Report unsaved edits to the route, which is where navigation can be held back
  // (`useBlocker` needs a data router, and this component is also rendered standalone).
  //
  // Declared BEFORE the onCreated effect on purpose: the save that creates a connector
  // clears `dirty` and assigns the id in the same commit, and the route navigates from
  // within onCreated. Effects run in declaration order, so reporting the cleared flag
  // first is what stops that navigation being mistaken for leaving unsaved work.
  useEffect(() => {
    onDirtyChange?.(state.dirty);
  }, [state.dirty, onDirtyChange]);

  // First successful "Save draft" on a brand-new connector assigns an id. Hand it
  // back so the page can swap /connectors/builder/new → /connectors/builder/:id.
  //
  // Held back while a publish is in flight. Publish on a never-saved connector creates it
  // first, so the id arrives mid-publish — and /new and /:id are different route elements,
  // so announcing it there remounts this page and reloads the connector before the publish
  // has landed: the author would be shown the draft under a "Published" toast.
  useEffect(() => {
    if (!id && state.id && !state.publishing && !announcedCreate.current) {
      announcedCreate.current = true;
      onCreated?.(state.id);
    }
  }, [id, state.id, state.publishing, onCreated]);

  const handleAddNode = (name: string) => {
    addNode(name);
    setSelection({ kind: 'node', name });
  };
  const handleCloneNode = (name: string) => {
    const cloned = cloneNode(name);
    if (cloned) setSelection({ kind: 'node', name: cloned });
  };
  const selectedNode = selection.kind === 'node' ? selection.name : undefined;

  return (
    // Pin the shell to the (relative) sidebar inset so it fills exactly the
    // available area and never grows the document — the inner panes scroll on
    // their own. Anchoring to 100dvh let the page scroll past the viewport.
    <div className='bg-muted/30 absolute inset-0 flex flex-col overflow-hidden'>
      <BuilderTopBar
        onToggleTest={() => {
          setDockOpen(v => !v);
        }}
        onBack={onBack}
      />

      {/* Body: left config column + work area (form region above results dock) */}
      <div className='flex min-h-0 flex-1'>
        {mode === 'builder' && (
          <div className='flex w-[236px] shrink-0 flex-col border-r'>
            {/* Builder / Code switch sits above the configuration tree */}
            <BuilderModeTabs mode={mode} onSetMode={requestMode} />
            <div className='min-h-0 flex-1 overflow-y-auto'>
              <BuilderNavRail
                manifest={manifest}
                selection={selection}
                onSelect={setSelection}
                onAddNode={handleAddNode}
                onCloneNode={handleCloneNode}
              />
            </div>
          </div>
        )}

        <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
          {mode === 'builder' ? (
            <div className='min-h-0 flex-1 overflow-y-auto'>
              <BuilderCenter selection={selection} onSelect={setSelection} />
            </div>
          ) : (
            <div className='flex min-h-0 flex-1 flex-col'>
              {/* In Code mode the switch heads the editor column so it stays reachable */}
              <BuilderModeTabs mode={mode} onSetMode={requestMode} />
              <div className='min-h-0 flex-1'>
                <CodeModeEditor />
              </div>
            </div>
          )}

          <ResultsDock
            selectedNode={selectedNode}
            open={dockOpen}
            onToggleOpen={() => {
              setDockOpen(v => !v);
            }}
          />
        </div>
      </div>

      <ConfirmationDialog
        open={confirmDropCode}
        onOpenChange={open => {
          if (!open) setConfirmDropCode(false);
        }}
        title='Discard the invalid JSON?'
        description={
          <p className='mt-2'>
            The JSON in Code mode doesn't parse, so it can't be applied. Switching to the Builder
            discards everything typed since it was last valid.
          </p>
        }
        confirmLabel='Discard & switch'
        cancelLabel='Cancel'
        variant='destructive'
        onConfirm={() => {
          setConfirmDropCode(false);
          setCodeInvalid(false);
          setMode('builder');
        }}
      />
    </div>
  );
}

export function ConnectorBuilderPage({
  id,
  onBack,
  onCreated,
  onDirtyChange,
}: {
  id?: string;
  onBack?: () => void;
  onCreated?: (id: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  return (
    <BuilderProvider>
      <BuilderShell id={id} onBack={onBack} onCreated={onCreated} onDirtyChange={onDirtyChange} />
    </BuilderProvider>
  );
}

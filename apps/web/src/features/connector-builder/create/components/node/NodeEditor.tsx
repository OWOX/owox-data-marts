import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Input } from '@owox/ui/components/input';
import { Box, Copy, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { useBuilder } from '../../../shared/model/hooks/useBuilder';
import { NodeSections } from './NodeSections';

export function NodeEditor({
  nodeName,
  onRemoved,
  onRenamed,
  onCloned,
}: {
  nodeName: string;
  onRemoved: () => void;
  onRenamed?: (newName: string) => void;
  onCloned?: (newName: string) => void;
}) {
  const { removeNode, renameNode, cloneNode, manifest } = useBuilder();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(nodeName);
  const skipCommit = useRef(false);

  // Reset the inline editor whenever the active node changes (switch or rename).
  useEffect(() => {
    setEditing(false);
  }, [nodeName]);

  const startEdit = () => {
    setDraft(nodeName);
    setEditing(true);
  };

  const commit = () => {
    if (skipCommit.current) {
      skipCommit.current = false;
      setEditing(false);
      return;
    }
    setEditing(false);
    const next = draft.trim();
    if (!next || next === nodeName) return;
    if (next in manifest.nodes) {
      toast.error(`A node named "${next}" already exists`);
      return;
    }
    const renamed = renameNode(nodeName, next);
    if (renamed) onRenamed?.(renamed);
  };

  const handleClone = () => {
    const cloned = cloneNode(nodeName);
    if (cloned) onCloned?.(cloned);
  };

  const handleDelete = () => {
    removeNode(nodeName);
    onRemoved();
  };

  return (
    <div className='px-6 py-[18px]' data-testid={`node-editor-${nodeName}`}>
      <div className='mb-4 flex items-center justify-between'>
        <div className='flex items-center gap-2.5'>
          <span className='bg-muted text-muted-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-md'>
            <Box className='h-[17px] w-[17px]' strokeWidth={1.7} />
          </span>
          {editing ? (
            <Input
              autoFocus
              value={draft}
              onChange={e => {
                setDraft(e.target.value);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  skipCommit.current = true;
                  e.currentTarget.blur();
                }
              }}
              onBlur={commit}
              aria-label='Node name'
              data-testid='node-rename-input'
              className='h-8 w-[220px] text-base font-medium'
            />
          ) : (
            <button
              type='button'
              onClick={startEdit}
              title='Click to rename'
              data-testid='node-rename'
              className='text-foreground hover:bg-accent -mx-1 rounded px-1 text-base font-medium'
            >
              {nodeName}
            </button>
          )}
          <span className='bg-accent text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium'>
            Node
          </span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type='button'
              aria-label={`Node actions ${nodeName}`}
              data-testid='node-actions'
              className='text-muted-foreground hover:bg-accent flex h-[30px] w-[30px] items-center justify-center rounded-[7px]'
            >
              <MoreVertical className='h-[18px] w-[18px]' />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem data-testid='node-rename-action' onClick={startEdit}>
              <Pencil className='h-4 w-4' />
              <span>Rename</span>
            </DropdownMenuItem>
            <DropdownMenuItem data-testid='node-clone-action' onClick={handleClone}>
              <Copy className='h-4 w-4' />
              <span>Clone</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-testid='node-delete-action'
              onClick={handleDelete}
              className='text-red-600 dark:text-red-400'
            >
              <Trash2 className='h-4 w-4 text-red-600 dark:text-red-400' />
              <span>Delete node</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <NodeSections nodeName={nodeName} />
    </div>
  );
}

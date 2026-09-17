import { useState } from 'react';
import { Input } from '@owox/ui/components/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { cn } from '@owox/ui/lib/utils';
import {
  Box,
  Copy,
  GitCompare,
  Lock,
  Menu,
  MoreVertical,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import type { BuilderManifest } from '../../shared/model/manifest.types';

export type BuilderSelection =
  | { kind: 'global'; section: 'general' | 'parameters' | 'authentication' }
  | { kind: 'node'; name: string };

interface Props {
  manifest: BuilderManifest;
  selection: BuilderSelection;
  onSelect: (s: BuilderSelection) => void;
  onAddNode: (name: string) => void;
  onCloneNode?: (name: string) => void;
}

const CountPill = ({ n }: { n: number }) => (
  <span className='bg-accent text-muted-foreground rounded-full px-[7px] py-px text-[11px]'>
    {n}
  </span>
);

const rowClass = (active: boolean) =>
  cn(
    'flex items-center gap-2.5 rounded-[7px] px-2.5 py-[7px] text-left text-[13px]',
    active
      ? 'bg-card text-foreground font-medium shadow-sm dark:bg-white/[0.06]'
      : 'text-muted-foreground hover:bg-accent'
  );

function NavRow({
  icon: Icon,
  label,
  meta,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  meta?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type='button' onClick={onClick} className={rowClass(active)}>
      <Icon className='h-[15px] w-[15px] shrink-0' strokeWidth={1.7} />
      <span className='truncate'>{label}</span>
      {meta && <span className='ml-auto flex items-center'>{meta}</span>}
    </button>
  );
}

function NodeRow({
  name,
  active,
  onSelect,
  onClone,
}: {
  name: string;
  active: boolean;
  onSelect: () => void;
  onClone?: () => void;
}) {
  return (
    <div className='group/node relative flex items-center'>
      <button
        type='button'
        onClick={onSelect}
        className={cn(rowClass(active), 'w-full', onClone && 'pr-8')}
      >
        <Box className='h-[15px] w-[15px] shrink-0' strokeWidth={1.7} />
        <span className='truncate'>{name}</span>
      </button>
      {onClone && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type='button'
              aria-label={`Node actions ${name}`}
              data-testid={`node-menu-${name}`}
              className='text-muted-foreground hover:bg-accent absolute right-1 flex h-6 w-6 items-center justify-center rounded opacity-0 group-hover/node:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100'
            >
              <MoreVertical className='h-4 w-4' />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem data-testid={`node-clone-${name}`} onClick={onClone}>
              <Copy className='h-4 w-4' />
              <span>Clone</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

export function BuilderNavRail({ manifest, selection, onSelect, onAddNode, onCloneNode }: Props) {
  const nodeNames = Object.keys(manifest.nodes);
  const paramCount = Object.keys(manifest.parameters).length;
  const [newName, setNewName] = useState('');

  const add = () => {
    const name = newName.trim();
    if (!name || name in manifest.nodes) return;
    onAddNode(name);
    setNewName('');
  };

  const isGlobal = (s: 'general' | 'parameters' | 'authentication') =>
    selection.kind === 'global' && selection.section === s;

  return (
    <nav
      className='flex h-full flex-col gap-px overflow-auto px-2.5 py-3.5 text-[13px]'
      data-testid='builder-nav-rail'
    >
      <div className='text-muted-foreground px-2 py-1.5 text-[11px] font-medium'>
        Global configuration
      </div>

      <NavRow
        icon={GitCompare}
        label='General'
        active={isGlobal('general')}
        onClick={() => {
          onSelect({ kind: 'global', section: 'general' });
        }}
      />
      <NavRow
        icon={Menu}
        label='Parameters'
        active={isGlobal('parameters')}
        onClick={() => {
          onSelect({ kind: 'global', section: 'parameters' });
        }}
        meta={paramCount > 0 ? <CountPill n={paramCount} /> : undefined}
      />
      <NavRow
        icon={Lock}
        label='Authentication'
        active={isGlobal('authentication')}
        onClick={() => {
          onSelect({ kind: 'global', section: 'authentication' });
        }}
      />

      <div className='bg-border mx-1.5 my-2.5 h-px' />

      <div className='flex items-center justify-between px-2 py-1.5'>
        <span className='text-muted-foreground text-[11px] font-medium'>Nodes</span>
        {nodeNames.length > 0 && <CountPill n={nodeNames.length} />}
      </div>

      {nodeNames.map(name => (
        <NodeRow
          key={name}
          name={name}
          active={selection.kind === 'node' && selection.name === name}
          onSelect={() => {
            onSelect({ kind: 'node', name });
          }}
          onClone={
            onCloneNode
              ? () => {
                  onCloneNode(name);
                }
              : undefined
          }
        />
      ))}

      <div className='mt-2.5 flex gap-2 px-1'>
        <Input
          value={newName}
          onChange={e => {
            setNewName(e.target.value);
          }}
          placeholder='Node name'
          className='h-8 flex-1'
          onKeyDown={e => {
            if (e.key === 'Enter') add();
          }}
        />
        <button
          type='button'
          onClick={add}
          aria-label='Add node'
          className='border-border bg-card text-foreground hover:bg-accent flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] border'
        >
          <Plus className='h-[15px] w-[15px]' />
        </button>
      </div>
    </nav>
  );
}

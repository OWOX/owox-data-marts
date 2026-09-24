import { useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Button } from '@owox/ui/components/button';
import toast from 'react-hot-toast';
import type { ConnectorListItem } from '../../../shared/model/types/connector';
import { ConnectorBuilderApiService } from '../../../../connector-builder/shared/api/connector-builder-api.service';

interface ConnectorVersionControlProps {
  info?: ConnectorListItem | null;
  version?: number;
  onChangeVersion: (version?: number) => void;
  disabled?: boolean;
}

export function ConnectorVersionControl({
  info,
  version,
  onChangeVersion,
  disabled,
}: ConnectorVersionControlProps) {
  const [open, setOpen] = useState(false);
  const [published, setPublished] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const followActiveRef = useRef<HTMLButtonElement>(null);

  // Version pinning only applies to custom connectors (bundled connectors have no versions).
  if (!info?.isCustom || !info.id) return null;
  const connectorId = info.id;

  const active = info.version ?? null;
  const isFollowing = version === undefined;
  const isStale = version !== undefined && active !== null && version < active;

  const label =
    active === null
      ? 'No published version'
      : isFollowing
        ? `Following active · v${active}`
        : version === active
          ? `Pinned · v${version} (active)`
          : `Pinned · v${version}`;

  const loadVersions = async () => {
    if (published !== null || loading) return;
    setLoading(true);
    setError(false);
    try {
      const detail = await new ConnectorBuilderApiService().getById(connectorId);
      setPublished(
        detail.versions
          .filter(v => v.status === 'published')
          .map(v => v.version)
          .sort((a, b) => b - a)
      );
    } catch {
      setError(true);
      toast.error('Failed to load connector versions');
    } finally {
      setLoading(false);
    }
  };

  const choose = (v?: number) => {
    setOpen(false);
    onChangeVersion(v);
  };

  return (
    <Popover
      open={open}
      onOpenChange={o => {
        setOpen(o);
        if (o) void loadVersions();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type='button'
          disabled={disabled ?? active === null}
          data-testid='connector-version-badge'
          aria-label='Connector version'
          className='bg-accent text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs disabled:opacity-50'
        >
          <span>{label}</span>
          {isStale && (
            <span className='rounded bg-amber-100 px-1.5 text-[10px] text-amber-800 dark:bg-amber-500/15 dark:text-amber-400'>
              update available
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align='end'
        className='w-72 p-0'
        data-testid='connector-version-popover'
        // The first focusable element is the info icon, and a focused tooltip trigger opens
        // its tooltip — so start on the first choice instead.
        onOpenAutoFocus={event => {
          event.preventDefault();
          followActiveRef.current?.focus();
        }}
      >
        <div className='text-muted-foreground flex items-center gap-1.5 border-b px-3 py-2 text-[11px] font-medium'>
          Connector version
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type='button'
                aria-label='About connector versions'
                className='hover:text-foreground inline-flex cursor-help items-center'
              >
                <Info className='h-3.5 w-3.5' />
              </button>
            </TooltipTrigger>
            <TooltipContent className='max-w-[260px] leading-snug'>
              The published version of this connector that the Data Mart runs. Follow active always
              runs the version that is active in the builder, so publishing or activating another
              version there takes effect on the next run. A pinned version stays until you change it
              here. The choice applies to every configuration of this Data Mart.
            </TooltipContent>
          </Tooltip>
        </div>
        <div className='flex flex-col gap-1 p-2'>
          <Button
            ref={followActiveRef}
            type='button'
            variant={isFollowing ? 'secondary' : 'ghost'}
            size='sm'
            className='justify-start'
            aria-label='Follow active'
            onClick={() => {
              choose(undefined);
            }}
          >
            Follow active{active !== null ? ` (v${active})` : ''}
          </Button>

          {isStale && (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='justify-start'
              aria-label={`Pin to active version ${active}`}
              onClick={() => {
                choose(active);
              }}
            >
              Pin to active (v{active})
            </Button>
          )}

          <div className='text-muted-foreground px-2 pt-1 text-[11px]'>
            Pin to a published version
          </div>
          {loading && <div className='text-muted-foreground px-2 py-1 text-[12px]'>Loading…</div>}
          {error && (
            <div className='text-destructive px-2 py-1 text-[12px]'>Failed to load versions</div>
          )}
          {published?.map(v => (
            <Button
              key={v}
              type='button'
              variant={v === version ? 'secondary' : 'ghost'}
              size='sm'
              className='justify-start'
              aria-label={`Pin to version ${v}`}
              onClick={() => {
                choose(v);
              }}
            >
              v{v}
              {v === active ? ' (active)' : ''}
              {v === version ? ' · pinned' : ''}
            </Button>
          ))}
          {published?.length === 0 && (
            <div className='text-muted-foreground px-2 py-1 text-[12px]'>No published versions</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

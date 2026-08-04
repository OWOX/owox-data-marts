import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Blocks, Plus, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useProjectRoute } from '../../../shared/hooks/useProjectRoute';
import type { PluginGalleryEntry } from '../types';
import { describeVisibility } from '../visibility';
import { AudienceIcon } from './AudienceIcon';

interface PluginCardProps {
  plugin: PluginGalleryEntry;
  onInstall: (plugin: PluginGalleryEntry) => void;
}

/**
 * One Gallery entry.
 *
 * Carries what §10 requires a Gallery to show -- display metadata, current SemVer, the
 * scopes that make it visible, suspension state, this member's installation state -- and
 * discloses its source exactly as far as §16 permits: the owner always, the repository
 * only when it is public.
 */
export function PluginCard({ plugin, onInstall }: PluginCardProps) {
  const { scope } = useProjectRoute();
  const navigate = useNavigate();
  const isInstalled = plugin.installationState === 'installed';
  const canInstall = !plugin.suspended && plugin.currentVersionId !== null;
  const visibility = describeVisibility(plugin.visibleViaScopes);

  const open = () => void navigate(scope(`/plugins/${plugin.pluginId}`));

  return (
    <div
      className='hover:border-foreground/20 bg-card flex cursor-pointer flex-col gap-3 rounded-lg border p-4 transition-colors'
      onClick={event => {
        // The corner action owns its own click; everything else opens the plugin.
        if (!(event.target as HTMLElement).closest('button, a')) {
          open();
        }
      }}
    >
      <div className='flex items-start gap-3'>
        {/*
          Placeholder mark. plugin.json carries no icon field yet, so every plugin gets
          the same glyph the sidebar uses for an installed one -- laying out the space a
          real icon will occupy rather than pretending one exists.
        */}
        <div className='bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md'>
          <Blocks className='size-6' aria-hidden />
        </div>

        <div className='min-w-0 flex-1'>
          <div className='truncate font-medium'>{plugin.displayName}</div>
          <div className='text-muted-foreground truncate text-xs'>by {plugin.source.ownerName}</div>
        </div>

        {/* Install or settings, top-right. */}
        {isInstalled ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='ghost'
                size='icon'
                className='-mt-1 shrink-0'
                aria-label={`Open ${plugin.displayName} settings`}
                onClick={open}
              >
                <Settings className='size-4' />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='ghost'
                size='icon'
                className='-mt-1 shrink-0'
                disabled={!canInstall}
                aria-label={`Install ${plugin.displayName}`}
                onClick={() => {
                  onInstall(plugin);
                }}
              >
                <Plus className='size-4' />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Install</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Two lines, then an ellipsis: a card grid stays readable only if every card is
          the same height regardless of how much the publisher wrote. */}
      <p className='text-muted-foreground line-clamp-2 min-h-[2.5rem] text-sm'>
        {plugin.description}
      </p>

      {/*
        Version and audience share one bottom row, centred on the same line -- two columns
        could only align their tops or their edges, never the centre of a small badge with
        the centre of a taller icon. min-h keeps every card the same height whether or not
        it has either.
      */}
      <div className='flex min-h-9 items-center justify-between gap-2'>
        <div className='flex flex-wrap items-center gap-1.5'>
          {plugin.currentSemver && <Badge variant='secondary'>v{plugin.currentSemver}</Badge>}
          {/* Suspended plugins stay listed rather than vanishing: a member who has one
              installed needs to see why it stopped working. */}
          {plugin.suspended && <Badge variant='destructive'>Unavailable</Badge>}
        </div>

        {/*
          Icon alone, with the sentence in the tooltip: on a grid of cards a permanent
          line of text competes with the plugin's own name for attention.

          - verified (badge-check): deployment admins listed it product-wide.
          - lock / users: the reader had a hand in listing it (personal or project).
          - unlisted: direct link only.
        */}
        {visibility && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className='text-muted-foreground inline-flex size-9 shrink-0 items-center justify-center'
                aria-label={visibility.summary}
              >
                <AudienceIcon audience={visibility.audience} />
              </span>
            </TooltipTrigger>
            {/* A sentence needs a width to wrap at; TooltipContent is w-fit by default,
                so without this it renders as one long line. */}
            <TooltipContent className='max-w-56'>{visibility.detail}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

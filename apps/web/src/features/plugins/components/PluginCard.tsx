import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { BadgeCheck, Blocks, Link2Off, Lock, Plus, Settings, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useProjectRoute } from '../../../shared/hooks/useProjectRoute';
import type { PluginGalleryEntry } from '../types';
import { describeVisibility, type PluginAudience } from '../visibility';

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
      className='hover:border-foreground/20 bg-card flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors'
      onClick={event => {
        // The corner action owns its own click; everything else opens the plugin.
        if (!(event.target as HTMLElement).closest('button, a')) {
          open();
        }
      }}
    >
      <div className='flex min-w-0 flex-1 flex-col gap-3'>
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
            <div className='text-muted-foreground truncate text-xs'>
              by {plugin.source.ownerName}
            </div>
          </div>
        </div>

        {/* Two lines, then an ellipsis: a card grid stays readable only if every card is
            the same height regardless of how much the publisher wrote. */}
        <p className='text-muted-foreground line-clamp-2 min-h-[2.5rem] text-sm'>
          {plugin.description}
        </p>

        <div className='flex flex-wrap items-center gap-1.5'>
          {plugin.currentSemver && <Badge variant='secondary'>v{plugin.currentSemver}</Badge>}
          {/* Suspended plugins stay listed rather than vanishing: a member who has one
              installed needs to see why it stopped working. */}
          {plugin.suspended && <Badge variant='destructive'>Unavailable</Badge>}
        </div>
      </div>

      {/*
        Install/settings stays top-right, audience bottom-right — same places as before.
        One fixed-width column stacks them so both share a common horizontal center
        (same size-9 hit target), instead of drifting apart because one is a Button
        and the other was an unpadded span.
      */}
      <div className='flex w-9 shrink-0 flex-col items-center justify-between self-stretch'>
        {isInstalled ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='ghost'
                size='icon'
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

        {/*
          Icon alone, with the sentence in the tooltip: on a grid of cards a permanent
          line of text competes with the plugin's own name for attention.

          - verified (badge-check): deployment admins listed it product-wide.
          - lock / users: the reader had a hand in listing it (personal or project).
          - unlisted: direct link only.
        */}
        {visibility ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className='text-muted-foreground inline-flex size-9 items-center justify-center'
                aria-label={visibility.summary}
              >
                <AudienceIcon audience={visibility.audience} />
              </span>
            </TooltipTrigger>
            {/* A sentence needs a width to wrap at; TooltipContent is w-fit by default,
                so without this it renders as one long line. */}
            <TooltipContent className='max-w-56'>{visibility.detail}</TooltipContent>
          </Tooltip>
        ) : (
          // Keep the column height stable when there is no audience mark.
          <span className='size-9' aria-hidden />
        )}
      </div>
    </div>
  );
}

/** Distinct marks rather than one glyph in states: each audience is a different idea. */
function AudienceIcon({ audience }: { audience: PluginAudience }) {
  if (audience === 'verified') {
    // BadgeCheck is the familiar "verified" seal (check in a badge / wavy circle).
    return <BadgeCheck className='size-4' aria-hidden />;
  }
  if (audience === 'you') {
    return <Lock className='size-4' aria-hidden />;
  }
  if (audience === 'project') {
    return <Users className='size-4' aria-hidden />;
  }

  return <Link2Off className='size-4' aria-hidden />;
}

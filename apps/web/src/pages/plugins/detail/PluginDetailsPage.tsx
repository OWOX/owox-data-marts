import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import {
  ArrowLeft,
  BookOpenIcon,
  CalendarIcon,
  EllipsisVertical,
  Info,
  Loader2,
  RefreshCw,
  Tag,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../features/idp';
import {
  AudienceIcon,
  InstallPluginDialog,
  usePlugin,
  usePluginActions,
  usePluginInstallations,
  usePluginManageablePublications,
  usePluginPublishing,
  usePublishableScopes,
  repositoryPath,
  safeHttpsUrl,
  type PluginGalleryEntry,
  describeVisibility,
} from '../../../features/plugins';
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardFooter,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
} from '../../../shared/components/CollapsibleCard';
import { UserAvatar, UserAvatarSize } from '../../../shared/components/UserAvatar';
import { GitHubIcon } from '../../../shared/icons';
import { useProjectRoute } from '../../../shared/hooks';
import { formatDateOnly } from '../../../utils/date-formatters';
import { versionHint } from './versionHint';
import { generateInitials } from '../../../shared/utils';

const UNPUBLISH_LABELS: Record<string, string> = {
  project: 'Unpublish from project',
  member: 'Unpublish for me',
};

/**
 * One plugin's own page.
 *
 * Structured like the Data Mart details page -- back arrow pulled into the gutter, a tab
 * strip, then collapsible sections of cards -- and built from the same pieces, so a
 * plugin does not read as a different product. Overview is the only tab this iteration
 * has: permissions, logs and per-plugin collections are explicit non-goals.
 */
export default function PluginDetailsPage() {
  const { pluginId } = useParams<{ pluginId: string }>();
  const { plugin, isLoading } = usePlugin(pluginId);
  const { install, uninstall, checkNow, isInstalling, isUpdating } = usePluginActions();
  const { installations } = usePluginInstallations();
  const publications = usePluginManageablePublications(pluginId ?? '');
  const { publish, unpublish, isPublishing, isUnpublishing } = usePluginPublishing();
  const publishableScopes = usePublishableScopes();
  const { scope } = useProjectRoute();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [confirming, setConfirming] = useState<PluginGalleryEntry | null>(null);

  if (isLoading || !plugin) {
    return (
      <div className='dm-page'>
        <div className='dm-page-content'>{isLoading ? 'Loading…' : 'Plugin not found'}</div>
      </div>
    );
  }

  /**
   * Runs the install mutation. Used after the confirmation dialog (first install or
   * restore of an uninstalled plugin) and for in-place reinstall while still installed.
   *
   * Backend soft-deletes only: an uninstalled row is reactivated, not recreated. UI still
   * asks again after uninstall so the member re-agrees to what they are restoring.
   *
   * §13: if the version moved on since this screen rendered, the server refuses and the
   * dialog reappears with the version that is current now.
   */
  const installPlugin = async (target: PluginGalleryEntry) => {
    const stale = await install(target.pluginId, target.currentVersionId);
    if (stale) {
      setConfirming({
        ...target,
        currentSemver: stale.currentSemver,
        currentVersionId: stale.currentVersionId,
      });
      return;
    }

    setConfirming(null);
  };

  const isInstalled = plugin.installationState === 'installed';
  // Label / confirm path: only a live install says "Reinstall". Uninstalled looks like
  // Install again (dialog), even though the API reactivates the same installation row.
  const showReinstall = isInstalled;
  const installation = installations.find(item => item.pluginId === plugin.pluginId);
  const visibility = describeVisibility(plugin.visibleViaScopes);
  // Source URLs travel as untrusted strings; only absolute https becomes an href.
  const ownerHref = safeHttpsUrl(plugin.source.ownerUrl);
  const repositoryHref = safeHttpsUrl(plugin.source.repositoryUrl);

  // §11 has no "move": publishing at another level only adds visibility. Sharing is
  // therefore publish-then-withdraw, and it is offered only to someone who may do both.
  const memberPublication = publications.find(item => item.scope === 'member');
  const canShareWithProject =
    publishableScopes.includes('project') &&
    memberPublication !== undefined &&
    !publications.some(item => item.scope === 'project');

  const shareWithProject = async () => {
    if (!memberPublication) {
      return;
    }

    const failure = await publish(memberPublication.repository, 'project');
    if (failure) {
      return;
    }

    await unpublish(memberPublication.repository, 'member').catch(() => undefined);
  };

  return (
    <div className='dm-page'>
      <div className='px-4 py-6 md:px-8 md:py-4 lg:px-12 xl:px-16'>
        <div className='mb-4 flex items-start justify-between gap-4'>
          {/* Negative margin pulls the arrow into the gutter, so the title aligns with
              the content below rather than sitting a button-width to its right. */}
          <div className='-ml-4 flex min-w-0 items-center md:-ml-6 md:gap-2 lg:-ml-11'>
            <Button
              variant='ghost'
              className='size-8 lg:size-9'
              aria-label='Back to plugins'
              onClick={() => void navigate(scope('/plugins'))}
            >
              <ArrowLeft className='h-4 w-4 lg:h-5 lg:w-5' />
            </Button>
            <h1 className='truncate text-2xl font-medium'>{plugin.displayName}</h1>
          </div>

          <div className='flex shrink-0 items-center gap-2'>
            {plugin.suspended && <Badge variant='destructive'>Temporarily unavailable</Badge>}

            <Button
              variant='outline'
              disabled={isInstalling || plugin.suspended || !plugin.currentVersionId}
              onClick={() => {
                if (isInstalling) {
                  return;
                }
                // Live install: reinstall in place without re-confirming.
                // not_installed / uninstalled: same Install + dialog path (backend reactivates).
                if (showReinstall) {
                  void installPlugin(plugin);
                  return;
                }
                setConfirming(plugin);
              }}
            >
              {isInstalling && <Loader2 className='size-4 animate-spin' aria-hidden />}
              {isInstalling
                ? showReinstall
                  ? 'Reinstalling…'
                  : 'Installing…'
                : showReinstall
                  ? 'Reinstall'
                  : 'Install'}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' size='icon' aria-label='More plugin actions'>
                  <EllipsisVertical className='size-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                {canShareWithProject && (
                  <DropdownMenuItem
                    disabled={isPublishing || isUnpublishing}
                    onClick={() => void shareWithProject()}
                  >
                    Share with the project
                  </DropdownMenuItem>
                )}

                {/* One entry per publication the caller may withdraw: the levels are
                    independent, so withdrawing a personal listing must not touch the
                    project's, and a plugin can be listed at both. */}
                {publications.map(publication => (
                  <DropdownMenuItem
                    key={publication.publicationId}
                    disabled={isUnpublishing}
                    onClick={() => {
                      // The hook rethrows after toasting, and nothing here needs the failure.
                      void unpublish(publication.repository, publication.scope).catch(
                        () => undefined
                      );
                    }}
                  >
                    {UNPUBLISH_LABELS[publication.scope] ?? 'Unpublish'}
                  </DropdownMenuItem>
                ))}

                {isInstalled && (
                  <>
                    {publications.length > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuItem onClick={() => void uninstall(plugin.pluginId)}>
                      Uninstall
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <nav
          className='no-scrollbar -mb-px flex gap-2 overflow-x-auto border-b whitespace-nowrap'
          aria-label='Tabs'
        >
          <span className='border-primary text-primary border-b-2 px-4 py-4 text-sm font-medium'>
            Overview
          </span>
        </nav>

        <div className='flex flex-col gap-4 pt-4'>
          <CollapsibleCard collapsible name='plugin-description'>
            <CollapsibleCardHeader>
              <CollapsibleCardHeaderTitle
                icon={BookOpenIcon}
                tooltip='What the publisher says this plugin does'
              >
                Description
              </CollapsibleCardHeaderTitle>
            </CollapsibleCardHeader>
            <CollapsibleCardContent>
              <p className='max-w-prose text-sm'>
                {plugin.description || 'This plugin has no description.'}
              </p>
            </CollapsibleCardContent>
            <CollapsibleCardFooter></CollapsibleCardFooter>
          </CollapsibleCard>

          <CollapsibleCard collapsible name='plugin-source'>
            <CollapsibleCardHeader>
              <CollapsibleCardHeaderTitle
                icon={GitHubIcon}
                tooltip='Where this plugin comes from and which version is current'
              >
                Source
              </CollapsibleCardHeaderTitle>
            </CollapsibleCardHeader>

            <CollapsibleCardContent>
              <div className='flex flex-col gap-4 md:flex-row'>
                {/* §16: the owner is always disclosed. Shown with the same avatar pill the
                    project's member lists use -- a GitHub owner is not an OWOX user and has
                    no avatar, but it should not read as a different kind of thing either. */}
                <InfoCard label='Author' hint='The GitHub account that controls future releases'>
                  {ownerHref ? (
                    <ExternalAnchor href={ownerHref}>
                      <Pill
                        icon={
                          <UserAvatar
                            initials={generateInitials(plugin.source.ownerName)}
                            displayName={plugin.source.ownerName}
                            size={UserAvatarSize.SMALL}
                          />
                        }
                      >
                        {plugin.source.ownerName}
                      </Pill>
                    </ExternalAnchor>
                  ) : (
                    <Pill
                      icon={
                        <UserAvatar
                          initials={generateInitials(plugin.source.ownerName)}
                          displayName={plugin.source.ownerName}
                          size={UserAvatarSize.SMALL}
                        />
                      }
                    >
                      {plugin.source.ownerName}
                    </Pill>
                  )}
                </InfoCard>

                {/* §16: withheld for a private repository -- naming it would confirm that
                    one specific private repository exists. */}
                <InfoCard label='Repository' hint='The plugin identity is this repository'>
                  {repositoryHref ? (
                    // owner/name runs long often enough that it has to truncate; the
                    // tooltip is how the full path stays reachable once it does.
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <ExternalAnchor href={repositoryHref} className='max-w-full min-w-0'>
                          <Pill icon={<GitHubIcon size={14} className='shrink-0' />}>
                            {repositoryPath(repositoryHref)}
                          </Pill>
                        </ExternalAnchor>
                      </TooltipTrigger>
                      <TooltipContent className='max-w-72 break-all'>
                        {repositoryPath(repositoryHref)}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Pill icon={<GitHubIcon size={14} className='shrink-0' />}>
                      {plugin.source.repositoryUrl
                        ? 'Repository link unavailable'
                        : 'Private repository'}
                    </Pill>
                  )}
                </InfoCard>

                {/*
                  The daily-cadence sentence lives in this tooltip rather than as a line
                  under the card: it belongs to the version, and a member reads it when they
                  ask what the version is, not as standing body text. The time is rendered in
                  the member's own timezone.
                */}
                <InfoCard label='Version' hint={versionHint(plugin.nextCheckAt)}>
                  <Pill icon={<Tag className='text-muted-foreground size-3.5 shrink-0' />}>
                    {plugin.currentSemver ? `v${plugin.currentSemver}` : 'No eligible release'}
                  </Pill>
                  {/*
                    Beside the value, not in the title row: a button there is taller than
                    a line of text, which would push this card's content below the other
                    two in the same row.

                    Not gated on installation: the backend opens Check now to any project
                    member who can reach this page (§6.3) -- an installation requirement
                    would only delay a check that is scheduled and inevitable anyway.
                  */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='shrink-0'
                        disabled={isUpdating}
                        aria-label='Check now'
                        onClick={() => void checkNow(plugin.pluginId)}
                      >
                        <RefreshCw className={isUpdating ? 'size-4 animate-spin' : 'size-4'} />
                      </Button>
                    </TooltipTrigger>
                    {/*
                      The deployment owns activation, so this only brings the already
                      scheduled check forward. No confirmation: nothing here is a choice.
                    */}
                    <TooltipContent>Check now</TooltipContent>
                  </Tooltip>
                </InfoCard>
              </div>
            </CollapsibleCardContent>

            <CollapsibleCardFooter
              left={
                /* Icon then plain language, matching the Gallery card so the two read as one
                   product. The audience mark is the same glyph the card uses. */
                visibility ? (
                  <span className='text-muted-foreground flex items-center gap-2 text-sm'>
                    <AudienceIcon audience={visibility.audience} className='size-4 shrink-0' />
                    {visibility.detail}
                  </span>
                ) : undefined
              }
            />
          </CollapsibleCard>

          <CollapsibleCard collapsible name='plugin-details'>
            <CollapsibleCardHeader>
              <CollapsibleCardHeaderTitle icon={Info} tooltip='Your installation of this plugin'>
                Details
              </CollapsibleCardHeaderTitle>
            </CollapsibleCardHeader>
            <CollapsibleCardContent>
              {installation ? (
                <div className='flex flex-col gap-4 md:flex-row'>
                  {/* Always the reader: an installation belongs to one member in one
                      project, and nobody ever sees anyone else's. */}
                  <InfoCard label='Installed By' hint='Installations are personal, never shared'>
                    <Pill
                      icon={
                        <UserAvatar
                          avatar={user?.avatar}
                          initials={generateInitials(user?.fullName, user?.email)}
                          displayName={user?.fullName ?? 'You'}
                          size={UserAvatarSize.SMALL}
                        />
                      }
                    >
                      {user?.fullName ?? 'You'}
                    </Pill>
                  </InfoCard>

                  <InfoCard label='Installed At' hint='When you last installed or restored it'>
                    <Pill
                      icon={<CalendarIcon className='text-muted-foreground size-3.5 shrink-0' />}
                    >
                      {formatDateOnly(installation.installedAt)}
                    </Pill>
                  </InfoCard>
                </div>
              ) : (
                <p className='text-muted-foreground text-sm'>
                  You have not installed this plugin in this project.
                </p>
              )}
            </CollapsibleCardContent>
            <CollapsibleCardFooter></CollapsibleCardFooter>
          </CollapsibleCard>

          {publications.length > 0 && (
            <p className='text-muted-foreground text-sm'>
              Unpublishing only removes the listing. Nobody is uninstalled, anyone who already
              installed it keeps it, and publishing again restores this listing rather than creating
              a second one.
            </p>
          )}
        </div>
      </div>

      {confirming && (
        <InstallPluginDialog
          plugin={confirming}
          open
          onOpenChange={open => {
            if (!open) {
              setConfirming(null);
            }
          }}
          onConfirm={() => void installPlugin(confirming)}
          isInstalling={isInstalling}
        />
      )}
    </div>
  );
}

/**
 * A labelled card inside a section, matching the Data Mart Overview: a title row whose
 * help icon surfaces on hover, then the value.
 */
function InfoCard({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className='dm-card-block group'>
      <div className='text-foreground flex items-center justify-between gap-2 text-sm font-medium'>
        <span>{label}</span>
        <span className='flex items-center gap-1'>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type='button'
                tabIndex={-1}
                className='pointer-events-none opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100'
                aria-label='Help information'
              >
                <Info
                  className='text-muted-foreground/50 hover:text-muted-foreground size-4 shrink-0 transition-colors'
                  aria-hidden='true'
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side='top' align='center' role='tooltip' className='max-w-56'>
              {hint}
            </TooltipContent>
          </Tooltip>
        </span>
      </div>
      <div className='flex min-w-0 items-center gap-2'>{children}</div>
    </div>
  );
}

/** The rounded value chip the Overview uses for dates and people. */
function Pill({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className='inline-flex max-w-full items-center gap-1 rounded-full bg-neutral-100 py-1 pr-3 pl-1 dark:bg-neutral-900'>
      <span className='flex aspect-square h-7 w-7 items-center justify-center rounded-full border bg-white dark:bg-white/10'>
        {icon}
      </span>
      <span className='text-muted-foreground min-w-0 truncate text-sm leading-tight'>
        {children}
      </span>
    </span>
  );
}

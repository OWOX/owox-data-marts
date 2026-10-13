import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@owox/ui/components/tabs';
import { ArrowLeft, History } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  InstallPluginDialog,
  usePluginActions,
  usePluginHistory,
  usePluginInstallations,
  type PluginGalleryEntry,
  type PluginHistoryEvent,
  type PluginHistoryType,
} from '../../../features/plugins';
import { CardSkeleton } from '../../../shared/components/CardSkeleton';
import { useProjectRoute } from '../../../shared/hooks';
import { formatDateOnly } from '../../../utils/date-formatters';

const FILTERS: { value: PluginHistoryType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'installations', label: 'Installations' },
  { value: 'publications', label: 'Publications' },
];

const EMPTY_STATES: Record<PluginHistoryType, { title: string; subtitle: string }> = {
  all: {
    title: 'No plugin history yet',
    subtitle: 'Plugins you install, and the ones published for this project, appear here.',
  },
  installations: {
    title: 'Nothing installed yet',
    subtitle: 'Plugins you install and remove appear here, so you can restore one later.',
  },
  publications: {
    title: 'Nothing published yet',
    subtitle:
      'Publications for this project, your own publications, and Verified listing changes appear here.',
  },
};

/** The member's plugin feed; Restore stays on the latest removal of a plugin still removed. */
export default function PluginHistoryPage() {
  const [type, setType] = useState<PluginHistoryType>('all');
  const { events, isLoading, isError, hasMore, isLoadingMore, loadMore, retry } =
    usePluginHistory(type);
  const { installations, isError: installationsFailed } = usePluginInstallations(true);
  const { install, isInstalling } = usePluginActions();
  const { scope } = useProjectRoute();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState<PluginGalleryEntry | null>(null);

  const removed = new Map(
    installations.filter(item => item.uninstalledAt !== null).map(item => [item.pluginId, item])
  );
  // Events arrive newest first, so the first removal seen per plugin is its latest.
  const restoreOn = new Map<string, string>();
  for (const event of events) {
    if (event.action === 'uninstall' && removed.has(event.plugin.pluginId)) {
      if (!restoreOn.has(event.plugin.pluginId)) {
        restoreOn.set(event.plugin.pluginId, event.id);
      }
    }
  }

  // A removal past the loaded pages has no row to carry Restore, so it is listed above the feed.
  const unlisted =
    type === 'publications'
      ? []
      : [...removed.values()].filter(item => !restoreOn.has(item.pluginId));

  /** The server refuses a stale version; the dialog then reopens with the current one. */
  const restore = async (
    target: PluginGalleryEntry,
    credentialSelections: Readonly<Record<string, string | null>>
  ) => {
    const stale = await install(target.pluginId, target.currentVersionId, credentialSelections);
    if (stale) {
      setConfirming(stale);
      return;
    }

    setConfirming(null);
  };

  const empty = EMPTY_STATES[type];

  const restoreButton = (target: PluginGalleryEntry) => (
    <>
      {target.suspended && <Badge variant='destructive'>Unavailable</Badge>}
      <Button
        variant='outline'
        aria-label={`Restore ${target.displayName}`}
        disabled={isInstalling || target.suspended || !target.currentVersionId}
        onClick={() => {
          setConfirming(target);
        }}
      >
        Restore
      </Button>
    </>
  );

  return (
    <div className='dm-page'>
      <header className='dm-page-header'>
        {/* Same gutter treatment as the plugin page, so the title lines up with content. */}
        <div className='-ml-4 flex min-w-0 items-center md:-ml-6 md:gap-2 lg:-ml-11'>
          <Button
            variant='ghost'
            className='size-8 lg:size-9'
            aria-label='Back to plugins'
            onClick={() => void navigate(scope('/plugins'))}
          >
            <ArrowLeft className='h-4 w-4 lg:h-5 lg:w-5' />
          </Button>
          <h1 className='dm-page-header-title truncate'>Plugin history</h1>
        </div>
        <p className='text-muted-foreground mt-1 text-sm'>
          Publishing lists a plugin in the Gallery for you, this project, or every project.
          Installing adds it to your own menu, and only you see your installations.
        </p>
      </header>

      <div className='dm-page-content'>
        <div className='dm-card flex flex-col gap-4'>
          <Tabs
            className='gap-4'
            value={type}
            onValueChange={value => {
              setType(value as PluginHistoryType);
            }}
          >
            <TabsList aria-label='Filter plugin history'>
              {FILTERS.map(filter => (
                <TabsTrigger key={filter.value} value={filter.value}>
                  {filter.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={type} className='flex flex-col gap-4'>
              {installationsFailed && type !== 'publications' && (
                <p className='text-muted-foreground text-sm'>
                  Restore is unavailable because your installations could not be loaded.
                </p>
              )}

              {isLoading && <CardSkeleton />}

              {!isLoading && unlisted.length > 0 && (
                <div className='flex flex-col gap-2'>
                  <h2 className='text-muted-foreground text-sm font-medium'>
                    Restore a removed plugin
                  </h2>
                  <ul aria-label='Removed plugins' className='divide-y'>
                    {unlisted.map(item => (
                      <li key={item.pluginId} className='flex items-center gap-3 py-3'>
                        <Link
                          to={scope(`/plugins/${item.pluginId}`)}
                          className='font-medium hover:underline'
                        >
                          {item.displayName}
                        </Link>
                        <span className='text-muted-foreground min-w-0 flex-1 text-sm'>
                          Removed {formatDateOnly(item.uninstalledAt)}
                        </span>
                        {restoreButton(item)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {isError && events.length === 0 && (
                <div className='flex flex-col items-start gap-2'>
                  <p className='text-muted-foreground text-sm'>
                    Plugin history could not be loaded.
                  </p>
                  <Button variant='outline' onClick={retry}>
                    Try again
                  </Button>
                </div>
              )}

              {!isLoading && !isError && events.length === 0 && !hasMore && (
                <div className='dm-empty-state'>
                  <History className='dm-empty-state-ico' strokeWidth={1} aria-hidden />
                  <h2 className='dm-empty-state-title'>{empty.title}</h2>
                  <p className='dm-empty-state-subtitle'>{empty.subtitle}</p>
                  <Button asChild variant='outline'>
                    <Link to={scope('/plugins')}>Browse plugins</Link>
                  </Button>
                </div>
              )}

              {!isLoading && events.length > 0 && (
                <ul className='divide-y' aria-label='Plugin history'>
                  {events.map(event => {
                    const target = removed.get(event.plugin.pluginId);
                    return (
                      <HistoryRow
                        key={event.id}
                        event={event}
                        href={scope(`/plugins/${event.plugin.pluginId}`)}
                        action={
                          target && restoreOn.get(event.plugin.pluginId) === event.id
                            ? restoreButton(target)
                            : undefined
                        }
                      />
                    );
                  })}
                </ul>
              )}

              {hasMore && (
                <Button
                  variant='outline'
                  className='self-center'
                  disabled={isLoadingMore}
                  onClick={loadMore}
                >
                  Show more
                </Button>
              )}
            </TabsContent>
          </Tabs>
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
          onConfirm={credentialSelections => {
            // install has already shown the failure.
            void restore(confirming, credentialSelections).catch(() => undefined);
          }}
          isInstalling={isInstalling}
        />
      )}
    </div>
  );
}

function HistoryRow({
  event,
  href,
  action,
}: {
  event: PluginHistoryEvent;
  href: string;
  action?: ReactNode;
}) {
  const name = (
    <Link to={href} className='font-medium hover:underline'>
      {event.plugin.displayName}
    </Link>
  );

  return (
    <li className='flex items-center gap-3 py-3'>
      <span className='text-muted-foreground w-24 shrink-0 text-sm'>
        {formatDateOnly(event.occurredAt)}
      </span>
      <span className='min-w-0 flex-1 text-sm'>{describe(event, name)}</span>
      {event.scope === 'deployment' && <Badge variant='secondary'>Verified</Badge>}
      {action}
    </li>
  );
}

function describe(event: PluginHistoryEvent, name: ReactNode): ReactNode {
  const actor = event.actor;
  switch (event.action) {
    case 'install':
      return <>You installed {name}</>;
    case 'restore':
      return <>You restored {name}</>;
    case 'uninstall':
      return <>You removed {name}</>;
    case 'publish':
    case 'unpublish': {
      const verb = event.action === 'publish' ? 'published' : 'unpublished';
      if (event.scope === 'deployment') {
        return <>{name}: Verified listing changed</>;
      }
      if (event.scope === 'member') {
        return (
          <>
            You {verb} {name} for yourself
          </>
        );
      }
      if (actor?.kind === 'you') {
        return (
          <>
            You {verb} {name} for the project
          </>
        );
      }
      if (actor?.kind === 'member') {
        return (
          <>
            <span className='font-medium'>{actor.name}</span> {verb} {name} for the project
          </>
        );
      }
      return (
        <>
          {name} was {verb} for the project
        </>
      );
    }
    case 'update': {
      const by =
        actor?.kind === 'you' ? ' by you' : actor?.kind === 'member' ? ` by ${actor.name}` : '';
      return (
        <>
          {name} updated{event.version ? ` to v${event.version}` : ''}
          {by}
        </>
      );
    }
    case 'suspend':
      return <>{name} was suspended by the deployment administrator</>;
    case 'resume':
      return <>{name} was resumed by the deployment administrator</>;
  }
}

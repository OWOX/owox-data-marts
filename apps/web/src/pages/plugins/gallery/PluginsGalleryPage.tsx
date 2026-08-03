import { Button } from '@owox/ui/components/button';
import { SearchInput } from '@owox/ui/components/common/search-input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { EllipsisVertical, Plus, Puzzle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  describeVisibility,
  InstallPluginDialog,
  PluginCard,
  PublishPluginSheet,
  useGalleryView,
  usePluginActions,
  usePluginGallery,
  type PluginFilter,
  type PluginGalleryEntry,
  type PluginSort,
} from '../../../features/plugins';
import { useProjectRoute } from '../../../shared/hooks';

const FILTER_LABELS: Record<PluginFilter, string> = {
  all: 'All plugins',
  installed: 'Installed',
  not_installed: 'Not installed',
  // Verified (deployment) listings are project-available too — same bucket, not a
  // separate filter that would overlap this one.
  project: 'Available to project',
  for_me: 'Only for me',
};

const SORT_LABELS: Record<PluginSort, string> = {
  default: 'Default',
  newest: 'Newest',
  alphabetical: 'A–Z',
};

export default function PluginsGalleryPage() {
  const { plugins, isLoading } = usePluginGallery();
  const { install, isInstalling } = usePluginActions();
  const { view, update } = useGalleryView();
  const { scope } = useProjectRoute();

  const [query, setQuery] = useState('');
  const [candidate, setCandidate] = useState<PluginGalleryEntry | null>(null);
  const [publishing, setPublishing] = useState(false);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const matches = plugins.filter(plugin => {
      if (!matchesGalleryFilter(plugin, view.filter)) {
        return false;
      }
      if (!needle) {
        return true;
      }

      return (
        plugin.displayName.toLowerCase().includes(needle) ||
        plugin.description.toLowerCase().includes(needle)
      );
    });

    // Copied before sorting: the query cache hands back the same array on every render,
    // and sorting it in place would quietly reorder what every other consumer sees.
    if (view.sort === 'alphabetical') {
      return [...matches].sort((a, b) => a.displayName.localeCompare(b.displayName));
    }
    if (view.sort === 'newest') {
      // Missing dates compare equal, so an older backend that omits addedAt leaves the
      // order alone instead of taking the page down with it.
      return [...matches].sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? ''));
    }

    return matches;
  }, [plugins, query, view]);

  /**
   * A stale rejection is not a failure: someone moved the plugin forward since this screen
   * was rendered. §13 requires refusing it, so the version that is current now goes into
   * the dialog and the member decides again rather than installing something unseen.
   *
   * First install and restore of an uninstalled plugin both go through the confirmation
   * dialog. Backend soft-deletes only, so restore reactivates the same installation row.
   */
  const installPlugin = async (plugin: PluginGalleryEntry) => {
    const stale = await install(plugin.pluginId, plugin.currentVersionId);
    if (stale) {
      setCandidate({
        ...plugin,
        currentSemver: stale.currentSemver,
        currentVersionId: stale.currentVersionId,
      });
      return;
    }

    setCandidate(null);
  };

  return (
    <div className='dm-page'>
      <header className='dm-page-header flex items-center justify-between'>
        <h1 className='dm-page-header-title'>Plugins</h1>

        <div className='flex items-center gap-1'>
          <Button
            variant='outline'
            onClick={() => {
              setPublishing(true);
            }}
          >
            <Plus className='size-4' aria-hidden /> Publish Plugin
          </Button>

          {/* History is a recovery path, not a routine one, so it sits behind the menu
              rather than competing with the only action that adds a plugin. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='icon' aria-label='More plugin actions'>
                <EllipsisVertical className='size-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem asChild>
                <Link to={scope('/plugins/history')}>Installation history</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className='dm-page-content'>
        {/* One container for the whole content section, as every other list page does:
            the header is its own band, and everything below sits on the card surface. */}
        <div className='dm-card flex flex-col gap-4'>
          {plugins.length > 0 && (
            <div className='flex flex-wrap items-center gap-2'>
              <SearchInput
                id='plugin-search'
                value={query}
                onChange={setQuery}
                placeholder='Search plugins'
              />

              <Select
                value={view.filter}
                onValueChange={value => {
                  update({ filter: value as PluginFilter });
                }}
              >
                <SelectTrigger className='ml-auto w-40' aria-label='Filter plugins'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FILTER_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={view.sort}
                onValueChange={value => {
                  update({ sort: value as PluginSort });
                }}
              >
                <SelectTrigger className='w-36' aria-label='Sort plugins'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SORT_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!isLoading && plugins.length === 0 && (
            <div className='dm-empty-state'>
              <Puzzle className='dm-empty-state-ico' strokeWidth={1} aria-hidden />
              <h2 className='dm-empty-state-title'>Add your first plugin</h2>
              <p className='dm-empty-state-subtitle'>
                Extend OWOX Data Marts with plugins published from a GitHub repository. Publishing
                one lists it here — installing it is still up to each member.
              </p>
            </div>
          )}

          {/* Distinct from having no plugins at all: the member has some, they just do not
              match what is on screen, and the fix is to change the query rather than publish. */}
          {plugins.length > 0 && visible.length === 0 && (
            <p className='text-muted-foreground py-8 text-center text-sm'>
              No plugins match this search or filter.
            </p>
          )}

          {visible.length > 0 && (
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
              {visible.map(plugin => (
                <PluginCard
                  key={plugin.pluginId}
                  plugin={plugin}
                  // Only ever called for a plugin that is not live: an installed card
                  // offers Settings instead. not_installed and uninstalled both ask first
                  // -- the backend reactivates a soft-uninstalled row, but the member
                  // still re-confirms what they are restoring.
                  onInstall={setCandidate}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <PublishPluginSheet
        isOpen={publishing}
        onClose={() => {
          setPublishing(false);
        }}
      />

      {candidate && (
        <InstallPluginDialog
          plugin={candidate}
          open
          onOpenChange={open => {
            if (!open) {
              setCandidate(null);
            }
          }}
          onConfirm={() => void installPlugin(candidate)}
          isInstalling={isInstalling}
        />
      )}
    </div>
  );
}

/**
 * Installation filters look at this member's install state.
 *
 * Audience filters: `for_me` is personal only; `project` is everything other members of
 * this project can also find (project listings and verified/deployment ones). Unlisted
 * direct-link entries match neither.
 */
function matchesGalleryFilter(plugin: PluginGalleryEntry, filter: PluginFilter): boolean {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'installed') {
    return plugin.installationState === 'installed';
  }
  if (filter === 'not_installed') {
    return plugin.installationState !== 'installed';
  }

  const audience = describeVisibility(plugin.visibleViaScopes)?.audience;
  if (filter === 'project') {
    return audience === 'project' || audience === 'verified';
  }

  // Remaining filter is `for_me`.
  return audience === 'you';
}

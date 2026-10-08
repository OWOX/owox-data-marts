import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@owox/ui/components/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import { Blocks, MoreHorizontal, Puzzle } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  UninstallPluginDialog,
  usePluginActions,
  usePluginGallery,
  usePluginInstallations,
  type InstalledPlugin,
} from '../../../features/plugins';
import { useProjectRoute } from '../../../shared/hooks';
import { getActiveMenuItemClassName, isSameOrNestedPath } from '../menu-item-active';

/**
 * The Plugins branch of the project navigation.
 *
 * A separate component rather than an entry in MainMenuItems: that list is a static
 * module constant with no access to server data, and the submenu here is one item per
 * installation. Threading a hook through the shared renderer would put a network
 * dependency in the render path of every other menu item.
 *
 * Hidden until the member has an active installation or the project has a Gallery plugin
 * a member can install (or install again after an uninstall). Until then the entry would only
 * advertise an empty page, so it stays out of the way; first publications arrive via the
 * control plane (owox-ctl).
 *
 * Each installed plugin carries its own menu with Settings and Uninstall. The submenu lists
 * installations, not Gallery listings, so a plugin can stay here after it leaves the
 * Gallery -- and this is where a member looks for a way to remove it.
 */
export function PluginsMenu() {
  const { scope } = useProjectRoute();
  const location = useLocation();
  const navigate = useNavigate();

  const { plugins, isLoading: galleryLoading } = usePluginGallery();
  const { installations, isLoading: installationsLoading } = usePluginInstallations(true);
  const { uninstall, isUninstalling } = usePluginActions();
  const [uninstalling, setUninstalling] = useState<InstalledPlugin | null>(null);

  const active = installations.filter(installation => installation.uninstalledAt === null);

  // At least one plugin listed for this project/member that can be installed, or installed again.
  const hasInstallablePlugin = plugins.some(
    plugin => !plugin.suspended && plugin.currentVersionId !== null
  );

  // Avoid a flash of the menu while the first gallery load is still in flight.
  if (galleryLoading || installationsLoading) {
    return null;
  }

  if (!hasInstallablePlugin && active.length === 0) {
    return null;
  }

  const rootHref = scope('/plugins');

  const openHref = (pluginId: string) => scope(`/plugins/${pluginId}/open`);

  // An installed plugin's open address has its own entry, so the parent steps back there.
  const isOnInstalledPluginPage = active.some(installation =>
    isSameOrNestedPath(location.pathname, openHref(installation.pluginId))
  );
  const isRootActive = isSameOrNestedPath(location.pathname, rootHref) && !isOnInstalledPluginPage;

  /**
   * Leaves the plugin's open address before the installation goes: that address offers the
   * install to a member without one, which is the opposite of what they just asked for. The
   * plugin's own page is where they can install it again.
   */
  const confirmUninstall = async (target: InstalledPlugin) => {
    if (isSameOrNestedPath(location.pathname, openHref(target.pluginId))) {
      void navigate(scope(`/plugins/${target.pluginId}`), { replace: true });
    }

    try {
      await uninstall(target.pluginId);
      setUninstalling(null);
    } catch {
      // The hook has already said why; the dialog stays open for another try.
    }
  };

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <SidebarMenuButton asChild className={getActiveMenuItemClassName(isRootActive)}>
                <Link to={rootHref} aria-current={isRootActive ? 'page' : undefined}>
                  <Puzzle className='size-4 shrink-0 transition-all' />
                  <span>Plugins</span>
                </Link>
              </SidebarMenuButton>
            </TooltipTrigger>
            <TooltipContent side='right'>Plugins</TooltipContent>
          </Tooltip>

          <SidebarMenuSub>
            {active.map(installation => {
              const href = openHref(installation.pluginId);
              const isActive = isSameOrNestedPath(location.pathname, href);

              return (
                <SidebarMenuSubItem key={installation.installationId}>
                  {/* pr-7 keeps a long name from running under the row menu. */}
                  <SidebarMenuSubButton
                    asChild
                    className={cn('pr-7', getActiveMenuItemClassName(isActive))}
                  >
                    {/*
                      Suspended installations stay listed and open their unavailable page:
                      removing them would leave a member guessing where the plugin went.

                      Blocks rather than Puzzle: the section header owns the puzzle mark, so
                      an individual plugin needs a glyph that reads as distinct from it.
                    */}
                    <Link to={href} aria-current={isActive ? 'page' : undefined}>
                      <Blocks className='size-4 shrink-0 transition-all' />
                      <span>{installation.displayName}</span>
                    </Link>
                  </SidebarMenuSubButton>

                  <InstalledPluginMenu
                    displayName={installation.displayName}
                    settingsHref={scope(`/plugins/${installation.pluginId}`)}
                    onUninstall={() => {
                      setUninstalling(installation);
                    }}
                  />
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </SidebarMenuItem>
      </SidebarMenu>

      {uninstalling && (
        <UninstallPluginDialog
          plugin={uninstalling}
          open
          onOpenChange={open => {
            if (!open) {
              setUninstalling(null);
            }
          }}
          onConfirm={() => void confirmUninstall(uninstalling)}
          isUninstalling={isUninstalling}
        />
      )}
    </>
  );
}

/**
 * One installed plugin's row menu.
 *
 * Settings opens the plugin's own page, the same place the Gallery card's gear leads, where
 * update and Credential access live too. It works whether or not anything still lists the
 * plugin, which is the case a card cannot cover.
 *
 * Revealed with its row, like menu actions elsewhere in the sidebar kit, and always shown
 * on narrow screens, which have no hover to reveal it.
 */
function InstalledPluginMenu({
  displayName,
  settingsHref,
  onUninstall,
}: {
  displayName: string;
  settingsHref: string;
  onUninstall: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          aria-label={`More actions for ${displayName}`}
          className={cn(
            'text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground absolute top-1 right-1 flex size-5 items-center justify-center rounded-md outline-hidden focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
            // A bigger hit area where fingers, not a pointer, reach for it.
            'after:absolute after:-inset-2 md:after:hidden',
            'group-focus-within/menu-sub-item:opacity-100 group-hover/menu-sub-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0'
          )}
        >
          <MoreHorizontal />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side='right' align='start'>
        <DropdownMenuItem asChild>
          <Link to={settingsHref}>Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onUninstall}>Uninstall</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

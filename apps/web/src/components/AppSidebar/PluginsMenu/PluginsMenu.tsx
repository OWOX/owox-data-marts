import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@owox/ui/components/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import { Blocks, MoreHorizontal, Puzzle } from 'lucide-react';
import { useRef } from 'react';
import { Link, useLocation } from 'react-router';
import {
  usePluginActions,
  usePluginGallery,
  usePluginInstallations,
  useUninstallConfirmation,
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
 * §10: shown while the member has an active installation, a removed one they can restore,
 * or a Gallery plugin to install (or install again after an uninstall). Until then the entry
 * would only advertise an empty page, so it stays out of the way; first publications arrive
 * via the control plane (owox-ctl). The restorable case keeps Installation history in reach
 * after a member uninstalls the last plugin nothing lists any more.
 *
 * Each installed plugin carries its own menu with Settings and Uninstall. The submenu lists
 * installations, not Gallery listings, so a plugin can stay here after it leaves the
 * Gallery -- and this is where a member looks for a way to remove it.
 */
export function PluginsMenu() {
  const { scope } = useProjectRoute();
  const location = useLocation();
  const rootLinkRef = useRef<HTMLAnchorElement>(null);

  const { plugins, isLoading: galleryLoading } = usePluginGallery();
  const { installations, isLoading: installationsLoading } = usePluginInstallations(true);
  const { uninstall, isUninstalling } = usePluginActions();
  // The row a removed plugin sat in is gone by the time the dialog closes; the section stays.
  const { requestUninstall, uninstallDialog } = useUninstallConfirmation({
    uninstall,
    isUninstalling,
    fallbackFocus: () => rootLinkRef.current,
  });

  const active = installations.filter(installation => installation.uninstalledAt === null);

  // Restore re-runs the install, which a suspension or a missing current version refuses.
  const hasRestorableInstallation = installations.some(
    installation =>
      installation.uninstalledAt !== null &&
      !installation.suspended &&
      installation.currentVersionId !== null
  );

  // At least one listed plugin that is installable now: not suspended, with a current version.
  const hasInstallablePlugin = plugins.some(
    plugin => !plugin.suspended && plugin.currentVersionId !== null
  );

  // Avoid a flash of the menu while the first gallery load is still in flight.
  if (galleryLoading || installationsLoading) {
    return <>{uninstallDialog}</>;
  }

  // The confirmation outlives the section: uninstalling the last plugin, when it is suspended
  // or has no version to restore, hides the section while the dialog still has to close.
  if (!hasInstallablePlugin && active.length === 0 && !hasRestorableInstallation) {
    return <>{uninstallDialog}</>;
  }

  const rootHref = scope('/plugins');

  const openHref = (pluginId: string) => scope(`/plugins/${pluginId}/open`);

  // An installed plugin's open address has its own entry, so the parent steps back there.
  const isOnInstalledPluginPage = active.some(installation =>
    isSameOrNestedPath(location.pathname, openHref(installation.pluginId))
  );
  const isRootActive = isSameOrNestedPath(location.pathname, rootHref) && !isOnInstalledPluginPage;

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <SidebarMenuButton asChild className={getActiveMenuItemClassName(isRootActive)}>
                <Link
                  ref={rootLinkRef}
                  to={rootHref}
                  aria-current={isRootActive ? 'page' : undefined}
                >
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
                  {/* pr-8 clears the row menu, including its larger touch target. */}
                  <SidebarMenuSubButton
                    asChild
                    className={cn('pr-8', getActiveMenuItemClassName(isActive))}
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
                    onUninstall={trigger => {
                      requestUninstall(installation, trigger);
                    }}
                  />
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </SidebarMenuItem>
      </SidebarMenu>

      {uninstallDialog}
    </>
  );
}

/**
 * One installed plugin's row menu.
 *
 * Settings opens the plugin's own page -- the same place the Gallery card's gear leads --
 * where update and Credential access live too, whether or not anything still lists it.
 *
 * The kit's menu action, aimed at the sub-item: its `showOnHover` keys on the parent item,
 * which would reveal every row's button at once. Hidden until the row is hovered or focused
 * only where a pointer can hover; touch screens of any width always show it, with the kit's
 * larger touch target (which the kit itself drops from 768px by width alone). The
 * data-sidebar override keeps the parent Plugins button from reserving room for an action
 * of its own.
 */
function InstalledPluginMenu({
  displayName,
  settingsHref,
  onUninstall,
}: {
  displayName: string;
  settingsHref: string;
  onUninstall: (trigger: HTMLElement | null) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuAction
          ref={triggerRef}
          data-sidebar='menu-sub-action'
          aria-label={`More actions for ${displayName}`}
          className={cn(
            'top-1 [@media(hover:hover)]:after:hidden [@media(hover:none)]:after:block!',
            'group-focus-within/menu-sub-item:opacity-100 group-hover/menu-sub-item:opacity-100 data-[state=open]:opacity-100 [@media(hover:hover)]:opacity-0'
          )}
        >
          <MoreHorizontal />
        </SidebarMenuAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent side='right' align='start'>
        <DropdownMenuItem asChild>
          <Link to={settingsHref}>Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            onUninstall(triggerRef.current);
          }}
        >
          Uninstall
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

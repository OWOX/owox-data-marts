import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@owox/ui/components/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Blocks, Puzzle } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { usePluginGallery, usePluginInstallations } from '../../../features/plugins';
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
 * Hidden until the project has at least one Gallery plugin a member can install (or
 * reinstall). Until then the entry would only advertise an empty page, so it stays out
 * of the way; first publications arrive via the control plane (owox-ctl).
 */
export function PluginsMenu() {
  const { scope } = useProjectRoute();
  const location = useLocation();

  const { plugins, isLoading: galleryLoading } = usePluginGallery();
  const { installations, isLoading: installationsLoading } = usePluginInstallations(true);

  const active = installations.filter(installation => installation.uninstalledAt === null);

  // At least one plugin listed for this project/member that can be installed or reinstalled.
  const hasInstallablePlugin = plugins.some(
    plugin => !plugin.suspended && plugin.currentVersionId !== null
  );

  // Avoid a flash of the menu while the first gallery load is still in flight.
  if (galleryLoading || installationsLoading) {
    return null;
  }

  if (!hasInstallablePlugin) {
    return null;
  }

  const rootHref = scope('/plugins');

  // Nested paths still light up the parent -- History and a plugin's own page have no
  // entry of their own -- except the run pages, which do. Two highlighted rows would
  // otherwise claim the reader is in two places at once.
  const isOnRunPage = isSameOrNestedPath(location.pathname, scope('/plugins/run'));
  const isRootActive = isSameOrNestedPath(location.pathname, rootHref) && !isOnRunPage;

  return (
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
            const href = scope(`/plugins/run/${installation.installationId}`);
            const isActive = isSameOrNestedPath(location.pathname, href);

            return (
              <SidebarMenuSubItem key={installation.installationId}>
                <SidebarMenuSubButton asChild className={getActiveMenuItemClassName(isActive)}>
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
              </SidebarMenuSubItem>
            );
          })}
        </SidebarMenuSub>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

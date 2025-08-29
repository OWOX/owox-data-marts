import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
} from '@owox/ui/components/sidebar';
import { Box, Plus, DatabaseIcon, ArchiveRestore } from 'lucide-react';
import { createElement } from 'react';
import { SidebarHeaderDropdown } from './sidebar-header-dropdown.tsx';
import { SidebarUserInfo } from './sidebar-user-info.tsx';
import { NavLink } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { useProjectRoute } from '../../shared/hooks';

// Prop types support
interface AppSidebarProps {
  variant?: 'sidebar' | 'floating' | 'inset';
  collapsible?: 'offcanvas' | 'icon' | 'none';
}

const items = [
  {
    title: 'Data Marts',
    url: '/data-marts',
    icon: Box,
  },
  {
    title: 'Storages',
    url: '/data-storages',
    icon: DatabaseIcon,
  },
  {
    title: 'Destinations',
    url: '/data-destinations',
    icon: ArchiveRestore,
  },
];

export function AppSidebar({ variant = 'inset', collapsible = 'icon' }: AppSidebarProps) {
  const { scope } = useProjectRoute();
  return (
    <Sidebar variant={variant} collapsible={collapsible}>
      <SidebarHeader>
        <SidebarHeaderDropdown />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <NavLink
              to={scope('/data-marts/create')}
              data-sidebar='menu-button'
              data-size='md'
              className={`peer/menu-button ring-sidebar-ring bg-primary hover:bg-primary-hover text-primary-foreground hover:text-primary-foreground flex h-8 w-full items-center gap-2 overflow-hidden rounded-full p-2 text-left text-sm outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0! focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0`}
            >
              <div className='flex aspect-square size-8 items-center justify-center'>
                <Plus className='size-4 shrink-0' />
              </div>

              <div className='grid flex-1 text-left text-sm leading-tight'>
                <span className='truncate font-medium'>New Data Mart</span>
              </div>
            </NavLink>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map(item => {
                return (
                  <SidebarMenuItem key={item.title}>
                    <NavLink
                      to={scope(item.url)}
                      className={({ isActive }) => {
                        return `flex w-full items-center gap-2 rounded-md font-medium transition-colors ${
                          isActive
                            ? 'bg-sidebar-active text-sidebar-active-foreground font-medium shadow-sm'
                            : ''
                        }`;
                      }}
                    >
                      <Tooltip delayDuration={500}>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton>
                            {createElement(item.icon, {
                              className: 'size-4 shrink-0 transition-all ',
                            })}
                            <span>{item.title}</span>
                          </SidebarMenuButton>
                        </TooltipTrigger>
                        <TooltipContent side='right'>{item.title}</TooltipContent>
                      </Tooltip>
                    </NavLink>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className='py-2'>
        <SidebarUserInfo />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

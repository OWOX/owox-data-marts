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
import { Home, Plus, DatabaseIcon } from 'lucide-react';
import { createElement } from 'react';
import { ThemeToggle } from '../ThemeToggle/theme-toggle.tsx';
import { SidebarHeaderDropdown } from './sidebar-header-dropdown.tsx';
import { Link } from 'react-router-dom';

// Prop types support
interface AppSidebarProps {
  variant?: 'sidebar' | 'floating' | 'inset';
  collapsible?: 'offcanvas' | 'icon' | 'none';
}

const items = [
  {
    title: 'Overview',
    url: '/data-marts/',
    icon: Home,
  },
  {
    title: 'Data Storages',
    url: '/data-storages/',
    icon: DatabaseIcon,
  },
];

export function AppSidebar({ variant = 'inset', collapsible = 'icon' }: AppSidebarProps) {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  return (
    <Sidebar variant={variant} collapsible={collapsible}>
      <SidebarHeader>
        <SidebarHeaderDropdown />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <Link
              to='/data-marts/create'
              data-sidebar='menu-button'
              data-size='md'
              className={`peer/menu-button ring-sidebar-ring bg-brand-blue-500 hover:bg-brand-blue-600 text-brand-blue-500-foreground hover:text-brand-blue-600-foreground flex h-8 w-full items-center gap-2 overflow-hidden rounded-full p-2 text-left text-sm outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0! focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0`}
            >
              <div className='flex aspect-square size-8 items-center justify-center'>
                <Plus className='size-4 shrink-0' />
              </div>

              <div className='grid flex-1 text-left text-sm leading-tight'>
                <span className='truncate font-medium'>Create new data mart</span>
              </div>
            </Link>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map(item => {
                const isActive = pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <a
                        href={item.url}
                        className={`flex items-center gap-2 rounded-md p-2 transition-colors ${
                          isActive
                            ? 'bg-sidebar-active text-sidebar-active-foreground hover:bg-sidebar-active hover:text-sidebar-active-foreground font-medium shadow-sm'
                            : 'hover:bg-sidebar-active hover:text-sidebar-active-foreground'
                        }`}
                      >
                        {createElement(item.icon, {
                          className: 'size-4 shrink-0 transition-all ',
                          strokeWidth: isActive ? 2.25 : 2,
                        })}
                        <span>{item.title}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className='p-2'>
        <ThemeToggle />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

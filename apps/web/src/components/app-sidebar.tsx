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
import { Home } from 'lucide-react';
import { createElement } from 'react';
import { ThemeToggle } from './theme-toggle';
import { SidebarHeaderDropdown } from './sidebar-header-dropdown';

// Prop types support
interface AppSidebarProps {
  variant?: 'sidebar' | 'floating' | 'inset';
  collapsible?: 'offcanvas' | 'icon' | 'none';
}

const items = [
  {
    title: 'Home',
    url: '/data-marts/',
    icon: Home,
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

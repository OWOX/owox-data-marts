// sidebar-nav-menu.tsx
import { NavLink } from 'react-router-dom';
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@owox/ui/components/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { useProjectRoute } from '../../../shared/hooks';
import { MainMenuItems } from './items';

export function MainMenu() {
  const { scope } = useProjectRoute();

  return (
    <SidebarMenu>
      {MainMenuItems.map(item => {
        const Icon = item.icon;
        return (
          <SidebarMenuItem key={item.title}>
            <NavLink
              to={scope(item.url)}
              className={({ isActive }) =>
                `flex w-full items-center gap-2 rounded-md font-medium transition-colors ${
                  isActive
                    ? 'bg-sidebar-active text-sidebar-active-foreground font-medium shadow-sm'
                    : ''
                }`
              }
            >
              {({ isActive }) => (
                <Tooltip delayDuration={500}>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton
                      className={`${
                        isActive ? 'hover:bg-transparent' : '' // disable hover if active
                      }`}
                    >
                      <Icon className='size-4 shrink-0 transition-all' />
                      <span>{item.title}</span>
                      {item.badge && (
                        <span className='bg-primary/20 text-primary ml-auto rounded-full px-2 py-0.5 text-xs'>
                          {item.badge}
                        </span>
                      )}
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  <TooltipContent side='right'>{item.title}</TooltipContent>
                </Tooltip>
              )}
            </NavLink>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

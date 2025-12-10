import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarGroupContent,
  SidebarRail,
} from '@owox/ui/components/sidebar';
import { SidebarProjectMenu } from './ProjectMenu';
import { UserMenu } from './UserMenu';
import { ActionButton } from './ActionButton';
import { MainMenu } from './MainMenu';
import { HelpMenu } from './HelpMenu';
import { Separator } from '@owox/ui/components/separator';

interface AppSidebarProps {
  variant?: 'sidebar' | 'floating' | 'inset';
  collapsible?: 'offcanvas' | 'icon' | 'none';
}

export function AppSidebar({ variant = 'inset', collapsible = 'icon' }: AppSidebarProps) {
  return (
    <Sidebar variant={variant} collapsible={collapsible}>
      <SidebarHeader>
        <SidebarProjectMenu />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <ActionButton />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupContent>
            <MainMenu />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <HelpMenu />
        <Separator />
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

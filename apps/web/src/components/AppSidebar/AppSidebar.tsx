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
import { SearchButton } from './SearchButton';
import { MainMenu } from './MainMenu';
import { HelpMenu } from './HelpMenu';
import { Separator } from '@owox/ui/components/separator';
import { SetupChecklistBlock } from './SetupChecklist';
import { useSetupChecklistVisibility } from './SetupChecklist/useSetupChecklistVisibility';

interface AppSidebarProps {
  variant?: 'sidebar' | 'floating' | 'inset';
  collapsible?: 'offcanvas' | 'icon' | 'none';
}

export function AppSidebar({ variant = 'inset', collapsible = 'icon' }: AppSidebarProps) {
  const setupChecklistVisibility = useSetupChecklistVisibility();
  return (
    <Sidebar variant={variant} collapsible={collapsible}>
      <SidebarHeader>
        <SidebarProjectMenu />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className='pt-0'>
          <SidebarGroupContent className='flex flex-col gap-2'>
            <SearchButton />
            <ActionButton />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupContent>
            <MainMenu />
          </SidebarGroupContent>
        </SidebarGroup>
        {setupChecklistVisibility.isVisible && (
          <SidebarGroup className='mt-auto'>
            <SidebarGroupContent>
              <SetupChecklistBlock visibility={setupChecklistVisibility} />
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <HelpMenu openSetupChecklist={setupChecklistVisibility.show} />
        <Separator />
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

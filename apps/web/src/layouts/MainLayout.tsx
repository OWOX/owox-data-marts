import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import {
  SidebarInset,
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@owox/ui/components/sidebar';
import { AppSidebar } from '../components/AppSidebar';
import { Logo } from '../components/Logo';
import { ThemeProvider } from '../app/providers/theme-provider.tsx';
import { storageService } from '../services';
import { GlobalLoader, LoadingProvider, useLoading } from '../shared/components/GlobalLoader';
import { Toaster as SonnerToaster } from '@owox/ui/components/sonner';
import { Toaster as HotToaster } from '../shared/components/Toaster';
import { AuthGuard } from '../features/idp';
import { ProjectIdGuard } from '../features/idp/components/ProjectIdGuard';
import { ProjectRoleGuard } from '../features/idp/components/ProjectRoleGuard';
import { useUser } from '../features/idp/hooks';
import type { User } from '../features/idp/types';
import { Separator } from '@owox/ui/components/separator';
import { ArchiveRestore, Box, DatabaseIcon, LockKeyhole } from 'lucide-react';
import { HelpMenu } from '../components/AppSidebar/HelpMenu';
import { UserMenu } from '../components/AppSidebar/UserMenu';

// Constants
const SIDEBAR_STATE_KEY = 'sidebar_state';
const RESTRICTED_NAV_ITEMS = [
  { title: 'Data Marts', icon: Box },
  { title: 'Storages', icon: DatabaseIcon },
  { title: 'Destinations', icon: ArchiveRestore },
];
const ignoreSetupChecklist = () => undefined;

function RestrictedProjectSidebar({ user }: { user: User }) {
  const projectTitle = user.projectTitle ?? user.projectId;

  return (
    <Sidebar variant='inset' collapsible='icon' data-testid='restricted-project-sidebar'>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size='lg'
              aria-disabled='true'
              className='cursor-default hover:bg-transparent hover:text-inherit active:bg-transparent active:text-inherit'
              tooltip='Project access is required'
            >
              <div className='text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-md border bg-white dark:bg-white/10'>
                <Logo width={24} height={24} />
              </div>
              <div className='grid flex-1 text-left text-sm leading-tight'>
                <span className='truncate font-medium'>OWOX Data Marts</span>
                <span className='text-muted-foreground truncate text-xs'>{projectTitle}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  aria-disabled='true'
                  className='text-muted-foreground hover:text-muted-foreground cursor-default hover:bg-transparent'
                  tooltip='Waiting for project access'
                >
                  <LockKeyhole className='size-4 shrink-0' />
                  <span>Access pending</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {RESTRICTED_NAV_ITEMS.map(item => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      aria-disabled='true'
                      className='text-muted-foreground/70 hover:text-muted-foreground/70 cursor-not-allowed hover:bg-transparent'
                      tooltip='Request access to use this section'
                    >
                      <Icon className='size-4 shrink-0' />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <HelpMenu openSetupChecklist={ignoreSetupChecklist} />
        <Separator />
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function MainLayoutContent() {
  const { state, isMobile } = useSidebar();
  const user = useUser();
  const isCollapsed = state === 'collapsed';
  const showTrigger = isMobile || isCollapsed;
  const { isLoading } = useLoading();
  const hasEmptyProjectRoles = Array.isArray(user?.roles) && user.roles.length === 0;

  return (
    <>
      {/* New Sonner toaster for shared UI toasts */}
      <SonnerToaster position='bottom-right' closeButton />
      {/* Legacy react-hot-toast Toaster to keep previously configured toasts working */}
      <HotToaster />
      <GlobalLoader isLoading={isLoading} />
      <AuthGuard>
        <ProjectIdGuard>
          <ProjectRoleGuard>
            {hasEmptyProjectRoles ? (
              <>
                <RestrictedProjectSidebar user={user} />
                <SidebarInset className='min-w-0'>
                  {showTrigger && <SidebarTrigger />}
                  <Outlet />
                </SidebarInset>
              </>
            ) : (
              <>
                <AppSidebar variant='inset' collapsible='icon' />
                <SidebarInset className='min-w-0'>
                  {showTrigger && <SidebarTrigger />}
                  <Outlet />
                </SidebarInset>
              </>
            )}
          </ProjectRoleGuard>
        </ProjectIdGuard>
      </AuthGuard>
    </>
  );
}

function MainLayout() {
  // Read the initial state from localStorage using our service
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    // Get value as boolean, default to true if not found
    return storageService.get(SIDEBAR_STATE_KEY, 'boolean') ?? true;
  });

  // Save state to localStorage using our service
  const handleSidebarChange = (open: boolean) => {
    setSidebarOpen(open);
    storageService.set(SIDEBAR_STATE_KEY, open);
  };

  return (
    <ThemeProvider>
      <LoadingProvider>
        <SidebarProvider open={sidebarOpen} onOpenChange={handleSidebarChange}>
          <MainLayoutContent />
        </SidebarProvider>
      </LoadingProvider>
    </ThemeProvider>
  );
}

export default MainLayout;

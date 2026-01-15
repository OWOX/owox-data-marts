import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@owox/ui/components/sidebar';
import { AppSidebar } from '../components/AppSidebar';
import { ThemeProvider } from '../app/providers/theme-provider.tsx';
import { storageService } from '../services';
import { GlobalLoader, LoadingProvider, useLoading } from '../shared/components/GlobalLoader';
import { Toaster as SonnerToaster } from '@owox/ui/components/sonner';
import { Toaster as HotToaster } from '../shared/components/Toaster';
import { AuthGuard } from '../features/idp';
import { ProjectIdGuard } from '../features/idp/components/ProjectIdGuard';

// Constants
const SIDEBAR_STATE_KEY = 'sidebar_state';

function MainLayoutContent() {
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const showTrigger = isMobile || isCollapsed;
  const { isLoading } = useLoading();

  return (
    <>
      {/* New Sonner toaster for shared UI toasts */}
      <SonnerToaster position='bottom-right' closeButton />
      {/* Legacy react-hot-toast Toaster to keep previously configured toasts working */}
      <HotToaster />
      <GlobalLoader isLoading={isLoading} />
      <AuthGuard redirectTo='/auth/sign-in'>
        <AppSidebar variant='inset' collapsible='icon' />
        <SidebarInset className='min-w-0'>
          {showTrigger && <SidebarTrigger />}
          <ProjectIdGuard>
            <Outlet />
          </ProjectIdGuard>
        </SidebarInset>
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

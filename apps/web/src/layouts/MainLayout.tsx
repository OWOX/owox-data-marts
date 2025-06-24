import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@owox/ui/components/sidebar';
import { AppSidebar } from '../components/AppSidebar/app-sidebar.tsx';
import { ThemeProvider } from '../app/providers/theme-provider.tsx';
import { storageService } from '../services';
import { GlobalLoader, LoadingProvider, useLoading } from '../shared/components/GlobalLoader';

// Constants
const SIDEBAR_STATE_KEY = 'sidebar_state';

function MainLayoutContent() {
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const showTrigger = isMobile || isCollapsed;
  const { isLoading } = useLoading();

  return (
    <>
      <GlobalLoader isLoading={isLoading} />
      <AppSidebar variant='inset' collapsible='icon' />
      <SidebarInset>
        <div className='relative h-full w-full'>
          {showTrigger && (
            <div className='absolute top-7 left-4 z-10 md:hidden'>
              <SidebarTrigger />
            </div>
          )}
          <Outlet />
        </div>
      </SidebarInset>
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

import { Outlet } from 'react-router-dom';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@owox/ui/components/sidebar';
import { AppSidebar } from '../components/app-sidebar';
import { ThemeProvider } from '../components/theme-provider';

function MainLayoutContent() {
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const showTrigger = isMobile || isCollapsed;

  return (
    <>
      <AppSidebar variant='inset' collapsible='icon' />
      <SidebarInset>
        <div className='relative h-full w-full'>
          {showTrigger && (
            <div className='absolute top-4 left-2 z-10 md:hidden'>
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
  return (
    <ThemeProvider>
      <SidebarProvider>
        <MainLayoutContent />
      </SidebarProvider>
    </ThemeProvider>
  );
}

export default MainLayout;

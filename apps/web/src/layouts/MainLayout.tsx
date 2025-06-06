import { Outlet } from 'react-router-dom';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@owox/ui/components/sidebar';
import { AppSidebar } from '../components/app-sidebar';
import { ThemeProvider } from '../components/theme-provider';

function MainLayout() {
  return (
    <ThemeProvider>
      <SidebarProvider>
        <AppSidebar variant="inset" collapsible="icon" />
        <SidebarInset>
          <div className="flex h-full w-full justify-between p-4">
            <SidebarTrigger />
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ThemeProvider>
  );
}

export default MainLayout;

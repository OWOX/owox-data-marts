import { Outlet } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@owox/ui/components/sidebar';
import { AppSidebar } from '../components/app-sidebar';
import { ThemeProvider } from '../components/theme-provider';

function MainLayout() {
  return (
    <ThemeProvider>
      <SidebarProvider>
        <AppSidebar />
        <main>
          <div className="flex items-center justify-between p-4">
            <SidebarTrigger />
          </div>
          <div>
            <Outlet />
          </div>
        </main>
      </SidebarProvider>
    </ThemeProvider>
  );
}

export default MainLayout;

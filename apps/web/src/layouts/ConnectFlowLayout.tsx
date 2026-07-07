import { Outlet } from 'react-router-dom';
import { ThemeProvider } from '../app/providers/theme-provider.tsx';
import { ProjectAuthGuards } from './ProjectAuthGuards';

/**
 * Minimal, chrome-free layout for quick single-purpose "connect X" flows opened directly
 * from an external link — not tied to any one integration surface (the MCP add_destination
 * tool links here today, but the same pattern fits an Excel add-in, a Google Sheets add-on,
 * or any other client that needs a fast, focused setup page). Still fully authenticated and
 * project-scoped — reuses the exact same guard chain as MainLayout via ProjectAuthGuards —
 * just without the sidebar/nav chrome. Reuse this for future connect-flow pages rather than
 * adding more one-off layouts.
 */
export function ConnectFlowLayout() {
  return (
    <ThemeProvider>
      <ProjectAuthGuards>
        <div className='bg-background flex min-h-screen items-center justify-center p-4'>
          <Outlet />
        </div>
      </ProjectAuthGuards>
    </ThemeProvider>
  );
}

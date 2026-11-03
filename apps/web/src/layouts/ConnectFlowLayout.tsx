import { Outlet, useLocation, useParams } from 'react-router';
import { ThemeProvider } from '../app/providers/theme-provider.tsx';
import { ProjectAuthGuards } from './ProjectAuthGuards';
import { Button } from '@owox/ui/components/button';
import { Toaster as SonnerToaster } from '@owox/ui/components/sonner';
import { Toaster as HotToaster } from '../shared/components/Toaster';
import { useAuth } from '../features/idp';
import { getConnectProjectTarget } from '../features/idp/utils/connect-project';

/**
 * Minimal, chrome-free layout for quick single-purpose "connect X" flows opened directly
 * from an external link — not tied to any one integration surface (the MCP add_destination
 * tool links here today, but the same pattern fits an Excel add-in, a Google Sheets add-on,
 * or any other client that needs a fast, focused setup page). Still fully authenticated and
 * project-scoped — reuses the exact same guard chain as MainLayout via ProjectAuthGuards —
 * just without the sidebar/nav chrome. Reuse this for future connect-flow pages rather than
 * adding more one-off layouts.
 */
export function ConnectFlowLayout({ flow = 'connect' }: { flow?: 'connect' | 'onboarding' }) {
  const { projectId } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const projectTitle = user?.projectTitle?.trim() ?? '';
  const projectLabel = user?.projectId === projectId ? projectTitle || projectId : undefined;
  const target = getConnectProjectTarget(location.pathname + location.search + location.hash);
  if (flow === 'connect' && (!target || target.projectId !== projectId)) {
    return (
      <div className='bg-background flex min-h-screen items-center justify-center p-4'>
        <div role='alert' className='max-w-lg space-y-4'>
          <h1 className='text-lg font-semibold'>Invalid setup link</h1>
          <p>This setup link is invalid. Request a new setup link.</p>
        </div>
      </div>
    );
  }
  return (
    <ThemeProvider>
      <SonnerToaster position='bottom-right' closeButton />
      <HotToaster />
      <ProjectAuthGuards authFallback={flow === 'connect' ? <ConnectProjectError /> : undefined}>
        <div className='bg-background flex min-h-dvh flex-col items-center justify-center gap-3 p-4'>
          {flow === 'connect' && projectLabel && (
            <p className='text-muted-foreground flex w-full max-w-2xl shrink-0 items-center gap-2 text-sm leading-5'>
              <span className='shrink-0'>Project:</span>
              <span className='text-foreground truncate font-medium' title={projectLabel}>
                {projectLabel}
              </span>
            </p>
          )}
          <Outlet key={`${user?.id}:${user?.projectId}`} />
        </div>
      </ProjectAuthGuards>
    </ThemeProvider>
  );
}

function ConnectProjectError() {
  const { error, errorCode, signIn, signOut } = useAuth();
  const accountChanged = errorCode === 'CONNECT_ACCOUNT_CHANGED';
  return (
    <div className='bg-background flex min-h-screen items-center justify-center p-4'>
      <div className='bg-card text-card-foreground w-full max-w-lg space-y-4 rounded-lg p-6 shadow-lg'>
        <h1 className='text-lg font-semibold'>
          {accountChanged ? 'Setup account changed' : 'Setup project unavailable'}
        </h1>
        <p role='alert' className='text-muted-foreground text-sm'>
          {error ?? 'OWOX could not open this setup. Sign in to its project and try again.'}
        </p>
        <Button
          onClick={() => {
            if (accountChanged) signOut();
            else signIn();
          }}
        >
          {accountChanged ? 'Sign out and switch account' : 'Switch to setup project'}
        </Button>
      </div>
    </div>
  );
}

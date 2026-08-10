import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import routes from './routes';
import './styles/App.css';
import { AuthProvider } from './features/idp';
import { GoogleTagManager as GTM } from '../src/app/gtm/GoogleTagManager.tsx';
import { IntercomChat } from './app/intercom/IntercomChat';
import { AppStoreProvider, AppBootstrap } from './app/store';
import { ContentPopovers } from './components/ContentPopovers';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

/**
 * OAuth callback pages run in a short-lived popup and only forward the
 * authorization result to the opener window. They must not boot the
 * authenticated app: the auth bootstrap calls /auth/access-token, which
 * rotates the single-use refresh-token cookie and races the opener tab's
 * session (intermittent auth failures), and on failure redirects the popup
 * to sign-in.
 */
function isOAuthCallbackWindow(): boolean {
  return window.location.pathname.startsWith('/oauth/');
}

function App() {
  const router = createBrowserRouter(routes);

  if (isOAuthCallbackWindow()) {
    return (
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppStoreProvider>
          <AppBootstrap>
            <GTM />
            <IntercomChat />
            <ContentPopovers />
            <RouterProvider router={router} />
          </AppBootstrap>
        </AppStoreProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

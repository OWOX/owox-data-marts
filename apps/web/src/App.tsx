import { RouterProvider, createBrowserRouter } from 'react-router-dom';
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

function App() {
  const router = createBrowserRouter(routes);

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

import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import routes from './routes';
import './styles/App.css';
import { AuthProvider } from './features/idp';
import { GoogleTagManager as GTM } from '../src/app/gtm/GoogleTagManager.tsx';
import { IntercomChat } from './app/intercom/IntercomChat';
import { AppStoreProvider, AppBootstrap } from './app/store';
import { FloatingPopoverProvider } from './shared/components/FloatingPopover/FloatingPopoverProvider';

function App() {
  const router = createBrowserRouter(routes);

  return (
    <AuthProvider>
      <AppStoreProvider>
        <AppBootstrap>
          <FloatingPopoverProvider>
            <GTM />
            <IntercomChat />
            <RouterProvider router={router} />
          </FloatingPopoverProvider>
        </AppBootstrap>
      </AppStoreProvider>
    </AuthProvider>
  );
}

export default App;

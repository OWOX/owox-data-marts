import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import routes from './routes';
import './styles/App.css';
import { AuthProvider } from './features/idp';
import { GoogleTagManager as GTM } from '../src/app/gtm/GoogleTagManager.tsx';
import { IntercomChat } from './app/intercom/IntercomChat';
import { AppStoreProvider, AppBootstrap } from './app/store';
import { ContentPopovers } from '../src/components/ContentPopovers';

function App() {
  const router = createBrowserRouter(routes);

  return (
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
  );
}

export default App;

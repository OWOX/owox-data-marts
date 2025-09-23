import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import routes from './routes';
import './styles/App.css';
import { AuthProvider } from './features/idp';
import { GoogleTagManager as GTM } from '../src/app/gtm/GoogleTagManager.tsx';
import { AppStoreProvider, AppBootstrap } from './app/store';

function App() {
  const router = createBrowserRouter(routes);

  return (
    <AuthProvider>
      <AppStoreProvider>
        <AppBootstrap>
          <GTM />
          <RouterProvider router={router} />
        </AppBootstrap>
      </AppStoreProvider>
    </AuthProvider>
  );
}

export default App;

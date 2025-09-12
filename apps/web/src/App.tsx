import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import routes from './routes';
import './styles/App.css';
import { AuthProvider } from './features/idp';
import { AppStoreProvider, AppBootstrap } from './app/store';

function App() {
  const router = createBrowserRouter(routes);

  return (
    <AuthProvider>
      <AppStoreProvider>
        <AppBootstrap>
          <RouterProvider router={router} />
        </AppBootstrap>
      </AppStoreProvider>
    </AuthProvider>
  );
}

export default App;

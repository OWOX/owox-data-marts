import { SidebarProvider, SidebarTrigger } from '@owox/ui/components/sidebar';
import './styles/App.css';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import routes from './routes';

function App() {
  const router = createBrowserRouter(routes);

  return <RouterProvider router={router} />;
}

export default App;

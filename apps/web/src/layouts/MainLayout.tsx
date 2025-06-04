import { Outlet } from 'react-router-dom';
import Navigation from '../components/Navigation';

function MainLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navigation />
      <main className="flex-grow">
        <Outlet />
      </main>
      <footer className="bg-gray-700 p-4 text-center text-white">
        <p>© 2025 OWOX. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default MainLayout;

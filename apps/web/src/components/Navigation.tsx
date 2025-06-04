import { Link } from 'react-router-dom';
import Logo from './Logo';

function Navigation() {
  return (
    <nav className="bg-white p-4">
      <div className="container mx-auto flex items-center justify-between">
        <Logo />
        <div className="text-xl font-bold text-gray-700">OWOX Data Marts</div>
        <ul className="flex space-x-4">
          <li>
            <Link to="/" className="text-black hover:text-gray-300">
              Home
            </Link>
          </li>
          <li>
            <Link to="/about" className="text-black hover:text-gray-300">
              About
            </Link>
          </li>
        </ul>
      </div>
    </nav>
  );
}

export default Navigation;

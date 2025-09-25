import { Link } from 'react-router-dom';
import { useProjectRoute } from '../shared/hooks';

function NotFound() {
  const { scope } = useProjectRoute();
  return (
    <div className='app-container'>
      <h1>404 - Page Not Found</h1>
      <p>The page you are looking for does not exist.</p>
      <Link to={scope('/data-marts')}>Go back to home</Link>
    </div>
  );
}

export default NotFound;

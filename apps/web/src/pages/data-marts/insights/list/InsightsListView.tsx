import { Link } from 'react-router-dom';

export default function InsightsListView() {
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ marginBottom: 12 }}>
        <Link className='btn btn-primary' to={'new'}>
          + New insight
        </Link>
      </div>
    </div>
  );
}

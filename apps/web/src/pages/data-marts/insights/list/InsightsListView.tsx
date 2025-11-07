import { Link } from 'react-router-dom';
import { useMemo } from 'react';

// Temporary mock until API/services are implemented
type Insight = {
  id: string;
  name: string;
  owner?: string;
  updatedAt?: string;
};

export default function InsightsListView() {
  const data: Insight[] = useMemo(
    () => [
      { id: 'ins-001', name: 'Revenue anomaly insight', owner: 'Alice', updatedAt: '2025-10-20' },
      { id: 'ins-002', name: 'ROAS trend insight', owner: 'Bob', updatedAt: '2025-10-18' },
    ],
    []
  );

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ marginBottom: 12 }}>
        <Link className='btn btn-primary' to={'new'}>
          + New insight
        </Link>
      </div>
      <table className='table' style={{ width: '100%', minWidth: 640 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Name</th>
            <th style={{ textAlign: 'left' }}>Owner</th>
            <th style={{ textAlign: 'left' }}>Updated</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.map(insight => (
            <tr key={insight.id}>
              <td>
                <Link to={insight.id}>{insight.name}</Link>
              </td>
              <td>{insight.owner ?? '-'}</td>
              <td>{insight.updatedAt ?? '-'}</td>
              <td style={{ textAlign: 'right' }}>
                <Link to={insight.id}>Open</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

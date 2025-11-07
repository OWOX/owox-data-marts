import { useParams, Link } from 'react-router-dom';

export default function InsightDetailsView() {
  const { insightId } = useParams();
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link to='..' className='btn btn-secondary'>
          ← Back to Insights
        </Link>
      </div>
      <div>Insight ID: {insightId}</div>
    </div>
  );
}

import { useNavigate, useParams } from 'react-router';
import { ConnectorBuilderRoute } from './ConnectorBuilderRoute';
export default function ConnectorBuilderEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  return <ConnectorBuilderRoute id={id} onBack={() => void navigate(-1)} />;
}

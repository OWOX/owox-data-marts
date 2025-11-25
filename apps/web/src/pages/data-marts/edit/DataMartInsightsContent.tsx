import { Outlet } from 'react-router-dom';
import { InsightsProvider } from '../../../features/data-marts/insights/model';

export default function DataMartInsightsContent() {
  return (
    <InsightsProvider>
      <Outlet />
    </InsightsProvider>
  );
}

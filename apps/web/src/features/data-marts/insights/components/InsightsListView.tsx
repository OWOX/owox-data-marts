import InsightsListSection from '../../../../features/data-marts/insights/components/InsightsListSection';
import { InsightsProvider } from '../model';

export default function InsightsListView() {
  return (
    <InsightsProvider>
      <InsightsListSection />
    </InsightsProvider>
  );
}

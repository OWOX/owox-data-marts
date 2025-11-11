import InsightsListSection from '../../../../features/data-marts/insights/components/InsightsListSection';
import { InsightsProvider } from '../../../../features/data-marts/insights/model';

export default function InsightsListView() {
  return (
    <InsightsProvider>
      <InsightsListSection />
    </InsightsProvider>
  );
}

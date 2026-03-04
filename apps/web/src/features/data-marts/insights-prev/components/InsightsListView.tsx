import InsightsListSection from './InsightsListSection';
import { InsightsProvider } from '../model';

export default function InsightsListView() {
  return (
    <InsightsProvider>
      <InsightsListSection />
    </InsightsProvider>
  );
}

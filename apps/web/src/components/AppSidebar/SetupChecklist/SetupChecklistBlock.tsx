import { useSidebar } from '@owox/ui/components/sidebar';
import { useSetupProgress } from './useSetupProgress';
import type { SetupChecklistVisibility } from './useSetupChecklistVisibility';
import { SetupChecklist } from './SetupChecklist';
import { SetupChecklistCollapsed } from './SetupChecklistCollapsed';

interface SetupChecklistBlockProps {
  visibility: SetupChecklistVisibility;
}

export function SetupChecklistBlock({ visibility }: SetupChecklistBlockProps) {
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  const progressResult = useSetupProgress();

  if (!visibility.isVisible) return null;
  if (progressResult.isLoading) return null;

  if (isCollapsed) {
    return (
      <SetupChecklistCollapsed
        percentage={progressResult.percentage}
        completedCount={progressResult.completedCount}
        totalCount={progressResult.totalCount}
      />
    );
  }

  return <SetupChecklist progressResult={progressResult} visibility={visibility} />;
}

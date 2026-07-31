import { useState } from 'react';
import { ModelCanvasView } from '../../../features/data-marts/model-canvas/components/ModelCanvasView';
import { RunActivityIndicator } from '../../../features/data-marts/shared/components/RunActivityIndicator';
import { useProjectRoute } from '../../../shared/hooks';

export default function ModelCanvasPage() {
  const [hasActiveQualityRun, setHasActiveQualityRun] = useState(false);
  const { navigate } = useProjectRoute();

  return (
    <div className='dm-page' data-testid='modelCanvasPage'>
      <header className='dm-page-header'>
        <div className='flex flex-wrap items-center justify-between gap-4'>
          <h1 className='dm-page-header-title'>Models</h1>
          <RunActivityIndicator
            active={hasActiveQualityRun}
            label='Checking data quality'
            onViewRuns={() => {
              navigate('/data-marts/runs');
            }}
          />
        </div>
      </header>
      <div className='dm-page-content'>
        <ModelCanvasView onActiveQualityRunChange={setHasActiveQualityRun} />
      </div>
    </div>
  );
}

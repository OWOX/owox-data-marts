import { useState } from 'react';
import { ModelCanvasView } from '../../../features/data-marts/model-canvas/components/ModelCanvasView';
import { ModelCanvasStorageSelect } from '../../../features/data-marts/model-canvas/components/ModelCanvasStorageSelect';
import { useModelCanvasFilters } from '../../../features/data-marts/model-canvas/model/use-model-canvas-filters';
import { RunActivityIndicator } from '../../../features/data-marts/shared/components/RunActivityIndicator';
import { DataStorageProvider } from '../../../features/data-storage/shared/model/context';
import { useDataStorage } from '../../../features/data-storage/shared/model/hooks/useDataStorage';
import { useProjectRoute } from '../../../shared/hooks';
import { ProjectDataMartSectionHeader } from '../shared/ProjectDataMartSectionHeader';

function ModelCanvasPageContent() {
  const [hasActiveQualityRun, setHasActiveQualityRun] = useState(false);
  const { navigate } = useProjectRoute();
  const { dataStorages } = useDataStorage();
  const filters = useModelCanvasFilters();

  return (
    <div className='dm-page' data-testid='modelCanvasPage'>
      <ProjectDataMartSectionHeader
        title='Model for'
        titleAfter={
          <ModelCanvasStorageSelect
            storages={dataStorages}
            storageId={filters.storageId}
            onStorageChange={filters.setStorageId}
            className='-my-2 ml-2 shrink-0'
          />
        }
        actions={
          <RunActivityIndicator
            active={hasActiveQualityRun}
            label='Checking data quality'
            onViewRuns={() => {
              navigate('/data-marts/runs');
            }}
          />
        }
      />
      <div className='dm-page-content'>
        <ModelCanvasView onActiveQualityRunChange={setHasActiveQualityRun} />
      </div>
    </div>
  );
}

export default function ModelCanvasPage() {
  return (
    <DataStorageProvider>
      <ModelCanvasPageContent />
    </DataStorageProvider>
  );
}

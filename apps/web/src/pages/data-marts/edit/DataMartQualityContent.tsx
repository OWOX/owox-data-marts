import { useOutletContext } from 'react-router-dom';
import { DataQualityWorkspace } from '../../../features/data-marts/data-quality';
import type { DataMartContextType } from '../../../features/data-marts/edit/model/context/types';

type QualityOutletContext = DataMartContextType & { projectId: string };

export default function DataMartQualityContent() {
  const { dataMart, projectId, registerSchemaGuard } = useOutletContext<QualityOutletContext>();

  if (!dataMart) return null;

  return (
    <DataQualityWorkspace
      projectId={projectId}
      dataMartId={dataMart.id}
      qualitySummary={dataMart.qualitySummary}
      schemaFields={dataMart.schema?.fields}
      registerUnsavedGuard={registerSchemaGuard}
    />
  );
}

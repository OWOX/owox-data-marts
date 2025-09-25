import { useParams } from 'react-router-dom';
import { DataMartProvider, DataMartDetails } from '../../../features/data-marts/edit';

/**
 * Route parameters for DataMartDetailsPage
 */
interface DataMartDetailsParams extends Record<string, string | undefined> {
  id: string;
  projectId: string;
}

export function DataMartDetailsPage() {
  const params = useParams<DataMartDetailsParams>();
  const { id, projectId } = params;

  if (!id) {
    return <div className='dm-page-header'>Data Mart ID is required</div>;
  }

  if (!projectId) {
    return <div className='dm-page-header'>Project ID is required</div>;
  }

  return (
    <div className='dm-page'>
      <DataMartProvider>
        <DataMartDetails id={id} />
      </DataMartProvider>
    </div>
  );
}

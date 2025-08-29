import { useParams } from 'react-router-dom';
import { DataMartProvider, DataMartDetails } from '../../../features/data-marts/edit';

export function DataMartDetailsPage() {
  const { id, projectId } = useParams<{ id: string; projectId: string }>();

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

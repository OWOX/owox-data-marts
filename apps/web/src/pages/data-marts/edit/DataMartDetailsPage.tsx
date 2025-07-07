import { useParams } from 'react-router-dom';
import { DataMartProvider, DataMartDetails } from '../../../features/data-marts/edit';

export function DataMartDetailsPage() {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return <div className='dm-page-header'>Data Mart ID is required</div>;
  }

  return (
    <div className='dm-page'>
      <DataMartProvider>
        <DataMartDetails id={id} />
      </DataMartProvider>
    </div>
  );
}

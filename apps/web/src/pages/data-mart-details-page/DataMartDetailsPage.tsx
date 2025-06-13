import { useParams } from 'react-router-dom';
import { DataMartProvider, DataMartDetails } from '../../features/data-mart';

export default function DataMartDetailsPage() {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return <div>Data Mart ID is required</div>;
  }

  return (
    <main className='container mx-auto'>
      <div>
        <DataMartProvider>
          <DataMartDetails id={id} />
        </DataMartProvider>
      </div>
    </main>
  );
}

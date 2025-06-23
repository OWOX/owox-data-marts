import { InlineEditDescription } from '../../../../shared/components/InlineEditDescription';
import { useOutletContext } from 'react-router-dom';
import { Toaster } from '../../../../shared/components/Toaster';

interface DataMartContextType {
  dataMart: {
    description: string;
    id: string;
  };
  updateDataMartDescription: (id: string, description: string | null) => Promise<void>;
}

export function DataMartOverview() {
  const { dataMart, updateDataMartDescription } = useOutletContext<DataMartContextType>();
  const handleDescriptionUpdate = async (newDescription: string | null) => {
    await updateDataMartDescription(dataMart.id, newDescription);
  };

  return (
    <div>
      <Toaster />

      <InlineEditDescription
        description={dataMart.description}
        onUpdate={handleDescriptionUpdate}
        placeholder='Add a description for this Data Mart...'
      />
    </div>
  );
}

import { DataMartCreateForm, DataMartProvider } from '../../../features/data-marts/edit';
import { DataStorageProvider } from '../../../features/data-storage/shared/model/context';
import { useProjectRoute } from '../../../shared/hooks';
import { useDataMartPreset } from '../../../features/data-marts/shared/utils/useDataMartPreset';

export default function CreateDataMartPage() {
  const preset = useDataMartPreset();
  const { navigate } = useProjectRoute();

  const handleSuccess = (response: { id: string }) => {
    const redirectUrl = preset
      ? `/data-marts/${response.id}/data-setup?preset=${preset.key}`
      : `/data-marts/${response.id}/data-setup`;
    navigate(redirectUrl);
  };

  return (
    <div className='flex h-full w-full items-center justify-center'>
      <div className='m-auto w-lg'>
        <div className='bg-muted/50 dark:bg-sidebar rounded-xl border-b border-gray-200 p-12 pt-8 dark:border-gray-700/50'>
          <h2 className='mb-4 text-xl font-medium'>Create Data Mart</h2>
          <DataStorageProvider>
            <DataMartProvider>
              <DataMartCreateForm
                initialData={{
                  title: preset?.datamartTitle ?? 'New Data Mart',
                }}
                onSuccess={handleSuccess}
              />
            </DataMartProvider>
          </DataStorageProvider>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import type { DataStorage } from '../../../data-storage/shared/model/types/data-storage.ts';
import { DataStorageType } from '../../../data-storage/shared/model/types/data-storage-type.enum.ts';
import { ListItemCard } from '../../../../shared/components/ListItemCard';
import { DataStorageTypeModel } from '../../../data-storage/shared/types/data-storage-type.model.ts';
import { DataStorageConfigSheet } from '../../../data-storage/edit';
import { DataStorageProvider } from '../../../data-storage/shared/model/context';
import { toast, Toaster } from 'react-hot-toast';
import { ExternalLink } from 'lucide-react';

interface DataMartDataStorageViewProps {
  dataStorage: DataStorage;
  onDataStorageChange?: (updatedStorage: DataStorage) => void;
}
export const DataMartDataStorageView = ({
  dataStorage,
  onDataStorageChange,
}: DataMartDataStorageViewProps) => {
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const dataStorageInfo = DataStorageTypeModel.getInfo(dataStorage.type);
  const handleCardClick = () => {
    setIsEditSheetOpen(true);
  };

  const handleClose = () => {
    setIsEditSheetOpen(false);
  };

  const getSubtitle = () => {
    // Check if necessary config fields exist based on storage type
    const hasRequiredFields = () => {
      switch (dataStorage.type) {
        case DataStorageType.GOOGLE_BIGQUERY:
          return Boolean(dataStorage.config.projectId && dataStorage.config.location);
        case DataStorageType.AWS_ATHENA:
          return Boolean(
            dataStorage.config.region &&
              dataStorage.config.databaseName &&
              dataStorage.config.outputBucket
          );
        default:
          return false;
      }
    };

    if (!hasRequiredFields()) {
      return 'Data Storage configuration is incomplete';
    }

    const formatParam = (label: string, value: string) => {
      return (
        <span>
          <span className='font-semibold'>{label}:</span>{' '}
          <span className='text-muted-foreground'>{value}</span>
        </span>
      );
    };

    const formatLinkParam = (label: string, value: string, href: string) => {
      return (
        <span>
          <span className='font-semibold'>{label}:</span>{' '}
          <a
            href={href}
            target='_blank'
            rel='noopener noreferrer'
            className='text-primary hover:underline'
            onClick={e => {
              e.stopPropagation();
            }}
          >
            {value}
            <ExternalLink className='ml-1 inline h-3 w-3' aria-hidden='true' />
          </a>
        </span>
      );
    };

    switch (dataStorage.type) {
      case DataStorageType.GOOGLE_BIGQUERY: {
        const projectId = dataStorage.config.projectId;
        const location = dataStorage.config.location;
        const bigQueryConsoleLink = `https://console.cloud.google.com/bigquery?project=${projectId}`;
        return (
          <div className='flex flex-wrap gap-2'>
            {formatLinkParam('Project ID', projectId, bigQueryConsoleLink)}
            <span className='text-muted-foreground'>•</span>
            {formatParam('Location', location)}
          </div>
        );
      }
      case DataStorageType.AWS_ATHENA: {
        const region = dataStorage.config.region;
        const databaseName = dataStorage.config.databaseName;
        const outputBucket = dataStorage.config.outputBucket;
        const athenaConsoleLink = `https://console.aws.amazon.com/athena/home?region=${region}#/query-editor`;
        const s3ConsoleLink = `https://s3.console.aws.amazon.com/s3/buckets/${outputBucket}?region=${region}`;
        return (
          <div className='flex flex-wrap gap-2'>
            {formatParam('Region', region)}
            <span className='text-muted-foreground'>•</span>
            {formatLinkParam('Database', databaseName, athenaConsoleLink)}
            <span className='text-muted-foreground'>•</span>
            {formatLinkParam('Bucket', outputBucket, s3ConsoleLink)}
          </div>
        );
      }
      default:
        return 'Unknown storage type configuration';
    }
  };

  return (
    <>
      <Toaster />
      <ListItemCard
        title={dataStorageInfo.displayName}
        icon={dataStorageInfo.icon}
        subtitle={getSubtitle()}
        onClick={handleCardClick}
      />
      <DataStorageProvider>
        <DataStorageConfigSheet
          isOpen={isEditSheetOpen}
          onClose={handleClose}
          dataStorage={dataStorage}
          onSaveSuccess={updatedStorage => {
            if (onDataStorageChange) {
              onDataStorageChange(updatedStorage);
            }
            void toast.success('Saved');
          }}
        />
      </DataStorageProvider>
    </>
  );
};

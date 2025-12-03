import { useState } from 'react';
import type { DataStorage } from '../../../data-storage/shared/model/types/data-storage.ts';
import {
  DataStorageType,
  isDataStorageConfigValid,
  RedshiftConnectionType,
} from '../../../data-storage';
import { ListItemCard } from '../../../../shared/components/ListItemCard';
import { DataStorageTypeModel } from '../../../data-storage/shared/types/data-storage-type.model.ts';
import { DataStorageConfigSheet } from '../../../data-storage/edit';
import { DataStorageProvider } from '../../../data-storage/shared/model/context';
import { AlertTriangle } from 'lucide-react';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

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
    const storageIsValid = isDataStorageConfigValid(dataStorage);

    if (!storageIsValid) {
      return (
        <div className='flex items-center space-x-2 text-sm'>
          <AlertTriangle className='h-4 w-4 text-red-500' />
          <span className='text-red-500'>Storage configuration is incomplete</span>
        </div>
      );
    }

    const formatParam = (label: string, value: string) => {
      return (
        <span>
          <span className='text-muted-foreground/75'>{label}:</span>{' '}
          <span className='text-muted-foreground font-medium'>{value}</span>
        </span>
      );
    };

    const formatLinkParam = (label: string, value: string, href: string) => {
      return (
        <span>
          <span className='text-muted-foreground/75'>{label}:</span>{' '}
          <ExternalAnchor
            href={href}
            onClick={e => {
              e.stopPropagation();
            }}
          >
            {value}
          </ExternalAnchor>
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
        const outputBucket = dataStorage.config.outputBucket;
        const s3ConsoleLink = `https://s3.console.aws.amazon.com/s3/buckets/${outputBucket}?region=${region}`;
        return (
          <div className='flex flex-wrap gap-2'>
            {formatParam('Region', region)}
            <span className='text-muted-foreground'>•</span>
            {formatLinkParam('Bucket', outputBucket, s3ConsoleLink)}
          </div>
        );
      }
      case DataStorageType.SNOWFLAKE: {
        const account = dataStorage.config.account;
        const warehouse = dataStorage.config.warehouse;
        const snowflakeConsoleLink = `https://app.snowflake.com/`;
        return (
          <div className='flex flex-wrap gap-2'>
            {formatLinkParam('Account', account, snowflakeConsoleLink)}
            <span className='text-muted-foreground'>•</span>
            {formatParam('Warehouse', warehouse)}
          </div>
        );
      }
      case DataStorageType.AWS_REDSHIFT: {
        const config = dataStorage.config;
        const region = config.region;
        const database = config.database;
        let identifier: string;
        let identifierType: string;

        if (config.connectionType === RedshiftConnectionType.SERVERLESS) {
          identifier = config.workgroupName;
          identifierType = 'Workgroup';
        } else {
          identifier = config.clusterIdentifier;
          identifierType = 'Cluster';
        }
        const redshiftConsoleLink = `https://${region}.console.aws.amazon.com/redshiftv2/home?region=${region}`;
        return (
          <div className='flex flex-wrap gap-2'>
            {formatParam('Region', region)}
            <span className='text-muted-foreground'>•</span>
            {formatParam('Database', database)}
            <span className='text-muted-foreground'>•</span>
            {formatLinkParam(identifierType, identifier, redshiftConsoleLink)}
          </div>
        );
      }
      default:
        return 'Unknown storage type configuration';
    }
  };

  return (
    <>
      <ListItemCard
        title={dataStorage.title}
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
          }}
        />
      </DataStorageProvider>
    </>
  );
};

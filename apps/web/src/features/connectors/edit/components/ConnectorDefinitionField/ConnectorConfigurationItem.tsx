import { Button } from '@owox/ui/components/button';
import { ExternalLink, Trash2 } from 'lucide-react';
import { DataMartConnectorView } from '../../DataMartConnectorView';
import { DataStorageType } from '../../../../data-storage';
import type { ConnectorConfig, ConnectorDefinitionConfig } from '../../../../data-marts/edit/model';
import { getStorageDisplayName } from './connector-definition.helpers';
import { ListItemCard } from '../../../../../shared/components/ListItemCard';
import { DataStorageTypeModel } from '../../../../data-storage/shared/types/data-storage-type.model';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { DataMartStatus } from '../../../../data-marts/shared/enums';
import type { DataStorage } from '../../../../data-storage/shared/model/types/data-storage';

interface ConnectorConfigurationItemProps {
  configIndex: number;
  connectorDef: ConnectorDefinitionConfig;
  onRemoveConfiguration: (configIndex: number) => void;
  onUpdateConfiguration: (configIndex: number) => (connector: ConnectorConfig) => void;
  dataMartStatus: DataMartStatus;
  totalConfigurations: number;
  dataStorage: DataStorage;
}

export function ConnectorConfigurationItem({
  configIndex,
  connectorDef,
  onRemoveConfiguration,
  onUpdateConfiguration,
  dataMartStatus,
  totalConfigurations,
  dataStorage,
}: ConnectorConfigurationItemProps) {
  const dataStorageInfo = DataStorageTypeModel.getInfo(dataStorage.type);

  const getConnectorSubtitle = () => {
    const node = connectorDef.connector.source.node || 'No node selected';
    return (
      <div className='flex flex-wrap gap-2'>
        <span>
          <span className='font-semibold'>Node:</span> <span className='text-primary'>{node}</span>
        </span>
      </div>
    );
  };

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

  const getStorageSubtitle = () => {
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

  const canRemoveConfiguration = () => {
    // Can't remove the last configuration in published pipeline
    if (dataMartStatus === DataMartStatus.PUBLISHED && totalConfigurations === 1) {
      return false;
    }
    return true;
  };

  return (
    <div className='flex w-full items-center pb-4'>
      <div className='flex-grow'>
        <div className='grid grid-cols-2 items-center gap-4'>
          <DataMartConnectorView
            dataStorageType={dataStorage.type}
            onSubmit={onUpdateConfiguration(configIndex)}
            configurationOnly={true}
            existingConnector={{
              source: {
                ...connectorDef.connector.source,
                configuration: [connectorDef.connector.source.configuration[configIndex]],
              },
              storage: connectorDef.connector.storage,
            }}
          >
            <ListItemCard
              title={connectorDef.connector.source.name || 'Connector'}
              subtitle={getConnectorSubtitle()}
              className='min-h-[80px] cursor-pointer transition-colors'
              onClick={() => {
                <></>;
              }}
            />
          </DataMartConnectorView>

          <ListItemCard
            title={getStorageDisplayName(dataStorage.type)}
            icon={dataStorageInfo.icon}
            subtitle={getStorageSubtitle()}
            className='bg-background min-h-[80px] cursor-default border-0 hover:shadow-none dark:bg-white/2'
          />
        </div>
      </div>

      <div className='shrink-0 pl-4'>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => {
                if (canRemoveConfiguration()) {
                  onRemoveConfiguration(configIndex);
                }
              }}
              disabled={!canRemoveConfiguration()}
              className='disabled:text-muted-foreground/50 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/50'
            >
              <Trash2 className='h-4 w-4' />
            </Button>
          </TooltipTrigger>
          {!canRemoveConfiguration() && (
            <TooltipContent>
              Cannot remove the last configuration in published pipeline
            </TooltipContent>
          )}
        </Tooltip>
      </div>
    </div>
  );
}

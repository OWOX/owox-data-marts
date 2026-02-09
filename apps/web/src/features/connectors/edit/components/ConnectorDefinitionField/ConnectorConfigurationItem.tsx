import { Button } from '@owox/ui/components/button';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
import { Info, Trash2, ChevronRight } from 'lucide-react';
import { DataMartConnectorView } from '../../DataMartConnectorView';
import { DataStorageType } from '../../../../data-storage';
import type { ConnectorConfig, ConnectorDefinitionConfig } from '../../../../data-marts/edit/model';
import {
  getBigQueryTableUrl,
  getBigQueryDatasetUrl,
  getRedshiftQueryEditorUrl,
} from '../../../../data-storage/shared/utils/storage-url.utils';
import { getStorageDisplayName } from './connector-definition.helpers';
import { ListItemCard } from '../../../../../shared/components/ListItemCard';
import { DataStorageTypeModel } from '../../../../data-storage/shared/types/data-storage-type.model';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { DataMartStatus } from '../../../../data-marts/shared/enums';
import type { DataStorage } from '../../../../data-storage/shared/model/types/data-storage';
import { useConnector } from '../../../shared/model/hooks/useConnector';
import { useEffect } from 'react';
import { RawBase64Icon } from '../../../../../shared/icons';
import { unquoteIdentifier } from '../../utils/snowflake-identifier.utils';
import { RedshiftConnectionType } from '../../../../data-storage/shared/model/types/credentials';

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
  totalConfigurations,
  dataStorage,
}: ConnectorConfigurationItemProps) {
  const dataStorageInfo = DataStorageTypeModel.getInfo(dataStorage.type);
  const { connectors, fetchAvailableConnectors } = useConnector();

  useEffect(() => {
    void fetchAvailableConnectors();
  }, [fetchAvailableConnectors]);

  const getConnectorIcon = (connectorName: string) => {
    const connector = connectors.find(c => c.name === connectorName);
    if (connector?.logoBase64) {
      return () => <RawBase64Icon base64={connector.logoBase64} size={24} />;
    }
    return undefined;
  };

  const getConnectorSubtitle = () => {
    const node = connectorDef.connector.source.node || 'No node selected';
    return (
      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-muted-foreground/75'>Data:</span>{' '}
        <span className='text-muted-foreground font-medium'>{node}</span>
        <span className='text-muted-foreground'>•</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className='text-muted-foreground flex items-center gap-1 font-medium'>
              <span>Edit config</span>
              <ChevronRight className='h-3 w-3' />
            </span>
          </TooltipTrigger>
          <TooltipContent>Edit connector configuration</TooltipContent>
        </Tooltip>
      </div>
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

  const getStorageSubtitle = () => {
    switch (dataStorage.type) {
      case DataStorageType.GOOGLE_BIGQUERY: {
        const projectId = dataStorage.config.projectId;
        const fullyQualifiedName = connectorDef.connector.storage.fullyQualifiedName;
        const dataset = fullyQualifiedName.split('.')[0];
        const table = fullyQualifiedName.split('.')[1];
        const datasetLink = getBigQueryDatasetUrl(projectId, dataset);

        return (
          <div className='flex flex-wrap items-center gap-2'>
            {formatLinkParam('Dataset', dataset, datasetLink)}
            <span className='text-muted-foreground'>•</span>
            {formatLinkParam('Table', table, getBigQueryTableUrl(projectId, dataset, table))}
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className='h-4 w-4' />
              </TooltipTrigger>
              <TooltipContent>
                The dataset and table are automatically created during the first run of the data
                mart, if they don't already exist
              </TooltipContent>
            </Tooltip>
          </div>
        );
      }
      case DataStorageType.AWS_ATHENA: {
        const region = dataStorage.config.region;
        const fullyQualifiedName = connectorDef.connector.storage.fullyQualifiedName;
        const [databaseName, table] = fullyQualifiedName.split('.');
        const athenaConsoleLink = `https://console.aws.amazon.com/athena/home?region=${region}#/query-editor`;
        return (
          <div className='flex flex-wrap items-center gap-2'>
            {formatLinkParam('Database', databaseName, athenaConsoleLink)}
            <span className='text-muted-foreground'>•</span>
            {formatLinkParam('Table', table, athenaConsoleLink)}
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className='h-4 w-4' />
              </TooltipTrigger>
              <TooltipContent>
                The database and table are automatically created during the first run of the data
                mart, if they don't already exist
              </TooltipContent>
            </Tooltip>
          </div>
        );
      }
      case DataStorageType.SNOWFLAKE: {
        const account = dataStorage.config.account;
        const fullyQualifiedName = connectorDef.connector.storage.fullyQualifiedName;
        const parts = fullyQualifiedName.split('.');
        const database = parts[0];
        const schema = parts[1];
        const table = parts[2];
        const snowflakeConsoleLink = `https://${account}.snowflakecomputing.com`;
        const databaseLink = `${snowflakeConsoleLink}/#/data/databases/${database}`;
        const schemaLink = `${snowflakeConsoleLink}/#/data/databases/${database}/schemas/${schema}`;
        const tableLink = `${snowflakeConsoleLink}/#/data/databases/${database}/schemas/${schema}/table/${table}`;
        return (
          <div className='flex flex-wrap items-center gap-2'>
            {formatLinkParam('Database', database, databaseLink)}
            <span className='text-muted-foreground'>•</span>
            {formatLinkParam('Schema', unquoteIdentifier(schema), schemaLink)}
            <span className='text-muted-foreground'>•</span>
            {formatLinkParam('Table', unquoteIdentifier(table), tableLink)}
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className='h-4 w-4' />
              </TooltipTrigger>
              <TooltipContent>
                The database, schema and table are automatically created during the first run of the
                data mart, if they don't already exist
              </TooltipContent>
            </Tooltip>
          </div>
        );
      }
      case DataStorageType.AWS_REDSHIFT: {
        const redshiftConfig = dataStorage.config;
        const fullyQualifiedName = connectorDef.connector.storage.fullyQualifiedName;
        const fqnParts = fullyQualifiedName.split('.');

        let schema: string;
        let table: string;

        if (fqnParts.length === 3) {
          schema = unquoteIdentifier(fqnParts[1]);
          table = unquoteIdentifier(fqnParts[2]);
        } else {
          schema = unquoteIdentifier(fqnParts[0]);
          table = unquoteIdentifier(fqnParts[1]);
        }

        const connectionInfo =
          redshiftConfig.connectionType === RedshiftConnectionType.SERVERLESS
            ? `Workgroup: ${redshiftConfig.workgroupName}`
            : `Cluster: ${redshiftConfig.clusterIdentifier}`;

        const redshiftConsoleLink = getRedshiftQueryEditorUrl(redshiftConfig.region);

        return (
          <div className='flex flex-wrap items-center gap-2'>
            <span>
              <span className='text-muted-foreground/75'>Region:</span>{' '}
              <span className='text-muted-foreground font-medium'>{redshiftConfig.region}</span>
            </span>
            <span className='text-muted-foreground'>•</span>
            <span>
              <span className='text-muted-foreground/75'>Database:</span>{' '}
              <span className='text-muted-foreground font-medium'>{redshiftConfig.database}</span>
            </span>
            <span className='text-muted-foreground'>•</span>
            <span>
              <span className='text-muted-foreground/75'>{connectionInfo.split(':')[0]}:</span>{' '}
              <span className='text-muted-foreground font-medium'>
                {connectionInfo.split(':')[1].trim()}
              </span>
            </span>
            <span className='text-muted-foreground'>•</span>
            {formatLinkParam('Schema', schema, redshiftConsoleLink)}
            <span className='text-muted-foreground'>•</span>
            {formatLinkParam('Table', table, redshiftConsoleLink)}
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className='h-4 w-4' />
              </TooltipTrigger>
              <TooltipContent>
                The schema and table are automatically created during the first run of the data
                mart, if they don't already exist
              </TooltipContent>
            </Tooltip>
          </div>
        );
      }
      case DataStorageType.DATABRICKS: {
        const fullyQualifiedName = connectorDef.connector.storage.fullyQualifiedName;
        const fqnParts = fullyQualifiedName.split('.');

        let catalog: string;
        let schema: string;
        let table: string;

        if (fqnParts.length === 3) {
          catalog = fqnParts[0];
          schema = fqnParts[1];
          table = fqnParts[2];
        } else {
          // If only 2 parts, assume no catalog (using default catalog)
          catalog = 'hive_metastore';
          schema = fqnParts[0];
          table = fqnParts[1];
        }

        const host = dataStorage.config.host;
        const databricksConsoleLink = `https://${host}`;

        return (
          <div className='flex flex-wrap items-center gap-2'>
            {formatLinkParam('Catalog', catalog, databricksConsoleLink)}
            <span className='text-muted-foreground'>•</span>
            {formatLinkParam('Schema', schema, databricksConsoleLink)}
            <span className='text-muted-foreground'>•</span>
            {formatLinkParam('Table', table, databricksConsoleLink)}
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className='h-4 w-4' />
              </TooltipTrigger>
              <TooltipContent>
                The catalog, schema and table are automatically created during the first run of the
                data mart, if they don't already exist
              </TooltipContent>
            </Tooltip>
          </div>
        );
      }
      default:
        return 'Unknown storage type configuration';
    }
  };

  const canRemoveConfiguration = () => {
    // Can't remove the last configuration
    if (totalConfigurations === 1) {
      return false;
    }
    return true;
  };

  return (
    <div className='border-border flex w-full items-center rounded-lg border-1 p-1 dark:bg-white/2'>
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
              icon={getConnectorIcon(connectorDef.connector.source.name)}
              title={connectorDef.connector.source.name || 'Connector'}
              subtitle={getConnectorSubtitle()}
              className='bg-background hover:bg-muted min-h-[80px] cursor-pointer border-0 transition-colors hover:shadow-none'
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

      <div className='shrink-0 px-4'>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                type='button'
                variant='ghost'
                onClick={() => {
                  if (canRemoveConfiguration()) {
                    onRemoveConfiguration(configIndex);
                  }
                }}
                disabled={!canRemoveConfiguration()}
              >
                <Trash2 className='h-4 w-4' />
              </Button>
            </span>
          </TooltipTrigger>
          {!canRemoveConfiguration() && (
            <TooltipContent>Remove last configuration only after adding a new one.</TooltipContent>
          )}
        </Tooltip>
      </div>
    </div>
  );
}

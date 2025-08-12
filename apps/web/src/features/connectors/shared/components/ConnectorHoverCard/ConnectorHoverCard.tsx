import { useEffect, useMemo, useCallback } from 'react';
import React from 'react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  HoverCardHeader,
  HoverCardHeaderText,
  HoverCardHeaderIcon,
  HoverCardHeaderTitle,
  HoverCardHeaderDescription,
  HoverCardBody,
  HoverCardItem,
  HoverCardItemLabel,
  HoverCardItemValue,
  HoverCardFooter,
} from '@owox/ui/components/hover-card';
import { type ConnectorConfig } from '../../../../data-marts/edit';
import { useConnector } from '../../model/hooks/useConnector.ts';
import { useDataMartContext } from '../../../../data-marts/edit/model';
import { RawBase64Icon } from '../../../../../shared';
import { type ReactNode } from 'react';
import { Button } from '@owox/ui/components/button';
import { ExternalLink } from 'lucide-react';
import RelativeTime from '@owox/ui/components/common/relative-time';
import { StatusLabel } from '../../../../../shared/components/StatusLabel';
import { ConnectorNameDisplay } from '../ConnectorNameDisplay';
import { mapRunStatusToStatusType, getRunStatusText } from '../../../../data-marts/shared';
import { openStorageConsole, getStorageButtonText } from '../../../../data-marts/shared';
import { getRunDataInfo } from '../../../../data-marts/shared/utils/run-data.utils.ts';

interface ConnectorHoverCardProps {
  connector: ConnectorConfig;
  children: ReactNode;
}

const useConnectorData = (connectorName: string) => {
  const { connectors } = useConnector();
  return useMemo(() => connectors.find(c => c.name === connectorName), [connectors, connectorName]);
};

export const ConnectorHoverCard = React.memo(
  function ConnectorHoverCard({ connector, children }: ConnectorHoverCardProps) {
    const connectorInfo = useConnectorData(connector.source.name);
    const { dataMart, runs, getDataMartRuns } = useDataMartContext();

    useEffect(() => {
      if (dataMart?.id) {
        void getDataMartRuns(dataMart.id);
      }
    }, [dataMart?.id, getDataMartRuns]);

    const connectorIcon = useMemo(() => {
      if (connectorInfo?.logoBase64) {
        return <RawBase64Icon base64={connectorInfo.logoBase64} size={20} />;
      }
      return null;
    }, [connectorInfo?.logoBase64]);

    const handleStorageOpen = useCallback(() => {
      if (!dataMart?.storage) {
        return;
      }

      openStorageConsole(dataMart.storage, connector.storage.fullyQualifiedName);
    }, [dataMart?.storage, connector.storage.fullyQualifiedName]);

    const runDataInfo = useMemo(() => getRunDataInfo(runs), [runs]);

    const lastRunStatus = useMemo(() => {
      if (!runDataInfo.lastRunDate || !runDataInfo.lastRunStatus) return null;
      return {
        statusType: mapRunStatusToStatusType(runDataInfo.lastRunStatus),
        statusText: getRunStatusText(runDataInfo.lastRunStatus),
        date: runDataInfo.lastRunDate,
      };
    }, [runDataInfo]);

    const buttonText = useMemo(() => {
      return dataMart?.storage ? getStorageButtonText(dataMart.storage) : 'Open data in storage';
    }, [dataMart?.storage]);

    const descriptionText = useMemo(() => {
      const fieldsCount = connector.source.fields.length.toString();
      return `${connector.source.node} • ${fieldsCount} fields`;
    }, [connector.source.node, connector.source.fields.length]);

    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <span>{children}</span>
        </HoverCardTrigger>
        <HoverCardContent>
          <HoverCardHeader>
            <HoverCardHeaderIcon>{connectorIcon}</HoverCardHeaderIcon>
            <HoverCardHeaderText>
              <HoverCardHeaderTitle>
                <ConnectorNameDisplay connector={connector} />
              </HoverCardHeaderTitle>
              <HoverCardHeaderDescription>{descriptionText}</HoverCardHeaderDescription>
            </HoverCardHeaderText>
          </HoverCardHeader>

          <HoverCardBody>
            <HoverCardItem>
              <HoverCardItemLabel>Last run status:</HoverCardItemLabel>
              <HoverCardItemValue>
                {lastRunStatus ? (
                  <StatusLabel type={lastRunStatus.statusType} variant='ghost'>
                    {lastRunStatus.statusText}
                  </StatusLabel>
                ) : (
                  'Not run yet'
                )}
              </HoverCardItemValue>
            </HoverCardItem>
            <HoverCardItem>
              <HoverCardItemLabel>Last run date:</HoverCardItemLabel>
              <HoverCardItemValue>
                {lastRunStatus ? <RelativeTime date={lastRunStatus.date} /> : 'Never run'}
              </HoverCardItemValue>
            </HoverCardItem>
            <HoverCardItem>
              <HoverCardItemLabel>Total runs:</HoverCardItemLabel>
              <HoverCardItemValue>
                {runDataInfo.totalRuns} runs
                {runDataInfo.firstRunDate && (
                  <>
                    , since{' '}
                    {runDataInfo.firstRunDate.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </>
                )}
              </HoverCardItemValue>
            </HoverCardItem>
          </HoverCardBody>

          <HoverCardFooter>
            <Button
              className='w-full'
              variant='default'
              onClick={handleStorageOpen}
              title='Open Storage'
              aria-label='Open Storage'
            >
              {buttonText}
              <ExternalLink className='ml-1 inline h-4 w-4' aria-hidden='true' />
            </Button>
          </HoverCardFooter>
        </HoverCardContent>
      </HoverCard>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison function to prevent unnecessary re-renders
    return (
      prevProps.connector.source.name === nextProps.connector.source.name &&
      prevProps.connector.storage.fullyQualifiedName ===
        nextProps.connector.storage.fullyQualifiedName &&
      prevProps.connector.source.node === nextProps.connector.source.node &&
      prevProps.connector.source.fields.length === nextProps.connector.source.fields.length
    );
  }
);

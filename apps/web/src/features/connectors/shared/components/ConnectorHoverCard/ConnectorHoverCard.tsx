import { useMemo, useCallback, useContext, useState } from 'react';
import React from 'react';
import {
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
import { DataMartContext, useDataMartContext } from '../../../../data-marts/edit/model';
import { RawBase64Icon } from '../../../../../shared';
import { DetailsPopover } from '../../../../../shared/components/DetailsPopover';
import { Button } from '@owox/ui/components/button';
import { ExternalLink } from 'lucide-react';
import RelativeTime from '@owox/ui/components/common/relative-time';
import { StatusLabel } from '../../../../../shared/components/StatusLabel';
import { ConnectorNameDisplay } from '../ConnectorNameDisplay';
import {
  mapRunStatusToStatusType,
  getRunStatusText,
  DataMartRunType,
} from '../../../../data-marts/shared';
import { getRunDataInfo } from '../../../../data-marts/shared/utils/run-data.utils.ts';
import { getStorageButtonText, openStorageConsole } from '../../../../data-storage';

interface ConnectorHoverCardProps {
  connector: ConnectorConfig;
  /** Extra classes for the info button, e.g. hover-reveal classes of a table cell */
  className?: string;
}

const useConnectorData = (connectorName: string) => {
  const { connectors } = useConnector();
  return useMemo(() => connectors.find(c => c.name === connectorName), [connectors, connectorName]);
};

export const ConnectorHoverCard = React.memo(
  function ConnectorHoverCard({ connector, className }: ConnectorHoverCardProps) {
    const connectorInfo = useConnectorData(connector.source.name);

    // Controlled so the context-dependent content only renders while the card is open
    const [isOpen, setIsOpen] = useState(false);
    // Run stats and the storage button need a loaded Data Mart; the project-wide Triggers page has
    // only the trigger's Data Mart id and title, so it shows the connector header alone
    const hasDataMart = useContext(DataMartContext) !== undefined;

    const connectorIcon = useMemo(() => {
      if (connectorInfo?.logoBase64) {
        return <RawBase64Icon base64={connectorInfo.logoBase64} size={20} />;
      }
      return null;
    }, [connectorInfo?.logoBase64]);

    const descriptionText = useMemo(() => {
      const fieldsCount = connector.source.fields.length.toString();
      return `${connector.source.node} • ${fieldsCount} fields`;
    }, [connector.source.node, connector.source.fields.length]);

    // Separate component for hover card content to isolate context usage
    const connectorFullyQualifiedName = connector.storage.fullyQualifiedName;
    const HoverCardContentInner = React.memo(() => {
      // This component only renders when hover card is open, reducing re-renders
      const { runs, dataMart } = useDataMartContext();

      // Extract stable values for dependency arrays
      const storage = dataMart?.storage;

      const runDataInfo = useMemo(
        () => getRunDataInfo(runs.filter(run => run.type === DataMartRunType.CONNECTOR)),
        [runs]
      );

      const lastRunDate = runDataInfo.lastRunDate;
      const lastRunStatusValue = runDataInfo.lastRunStatus;

      const lastRunStatus = useMemo(() => {
        if (!lastRunDate || !lastRunStatusValue) return null;
        return {
          statusType: mapRunStatusToStatusType(lastRunStatusValue),
          statusText: getRunStatusText(lastRunStatusValue),
          date: lastRunDate,
        };
      }, [lastRunDate, lastRunStatusValue]);

      const buttonText = useMemo(() => {
        return storage && getStorageButtonText(storage);
      }, [storage]);

      const handleStorageOpen = useCallback(() => {
        if (!storage) {
          return;
        }
        openStorageConsole(storage, connectorFullyQualifiedName);
      }, [storage]);

      return (
        <>
          <HoverCardBody>
            {lastRunStatus && (
              <HoverCardItem>
                <HoverCardItemLabel>Last run status:</HoverCardItemLabel>
                <HoverCardItemValue>
                  <StatusLabel type={lastRunStatus.statusType} variant='ghost'>
                    {lastRunStatus.statusText}
                  </StatusLabel>
                </HoverCardItemValue>
              </HoverCardItem>
            )}
            {lastRunStatus?.date && (
              <HoverCardItem>
                <HoverCardItemLabel>Last run date:</HoverCardItemLabel>
                <HoverCardItemValue>
                  <RelativeTime date={lastRunStatus.date} />
                </HoverCardItemValue>
              </HoverCardItem>
            )}
            <HoverCardItem>
              {runDataInfo.totalRuns > 0 ? (
                <HoverCardItemLabel>Total runs:</HoverCardItemLabel>
              ) : (
                ''
              )}
              <HoverCardItemValue>
                {runDataInfo.totalRuns === 0
                  ? 'No runs'
                  : `${runDataInfo.totalRuns.toString()} run${runDataInfo.totalRuns > 1 ? 's' : ''}`}
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
        </>
      );
    });
    HoverCardContentInner.displayName = 'HoverCardContentInner';

    return (
      <DetailsPopover
        label='Connector details'
        className={className}
        open={isOpen}
        onOpenChange={setIsOpen}
      >
        <HoverCardHeader>
          <HoverCardHeaderIcon>{connectorIcon}</HoverCardHeaderIcon>
          <HoverCardHeaderText>
            <HoverCardHeaderTitle>
              <ConnectorNameDisplay connector={connector} />
            </HoverCardHeaderTitle>
            <HoverCardHeaderDescription>{descriptionText}</HoverCardHeaderDescription>
          </HoverCardHeaderText>
        </HoverCardHeader>
        {isOpen && hasDataMart && <HoverCardContentInner />}
      </DetailsPopover>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison function to prevent unnecessary re-renders
    // Compare all relevant connector properties to ensure we only re-render when connector actually changes
    const connectorChanged =
      prevProps.connector.source.name !== nextProps.connector.source.name ||
      prevProps.connector.storage.fullyQualifiedName !==
        nextProps.connector.storage.fullyQualifiedName ||
      prevProps.connector.source.node !== nextProps.connector.source.node ||
      prevProps.connector.source.fields.length !== nextProps.connector.source.fields.length;

    return !connectorChanged && prevProps.className === nextProps.className;
  }
);

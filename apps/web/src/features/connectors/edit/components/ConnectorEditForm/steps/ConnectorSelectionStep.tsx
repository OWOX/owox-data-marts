import { AlertCircle, Unplug, Pencil } from 'lucide-react';
import { Alert, AlertDescription } from '@owox/ui/components/alert';
import type { ConnectorListItem } from '../../../../shared/model/types/connector';
import { RawBase64Icon } from '../../../../../../shared/icons';
import {
  AppWizardStep,
  AppWizardGrid,
  AppWizardGridItem,
  AppWizardStepSection,
  AppWizardStepHero,
  AppWizardStepLoading,
} from '@owox/ui/components/common/wizard';
import { trackEvent } from '../../../../../../utils';
import { useEffect } from 'react';
import { InviteTeammatesCard } from '../../../../../../shared/components/InviteTeammatesCard';
import { Button } from '@owox/ui/components/button';
import { Badge } from '@owox/ui/components/badge';

interface ConnectorSelectionStepProps {
  connectors: ConnectorListItem[];
  selectedConnector: ConnectorListItem | null;
  loading: boolean;
  error: string | null;
  onConnectorSelect: (connector: ConnectorListItem) => void;
  onConnectorDoubleClick?: (connector: ConnectorListItem) => void;
  customConnectors: ConnectorListItem[];
  onCreateNew: () => void;
  onEditConnector?: (connector: ConnectorListItem) => void;
}

export function ConnectorSelectionStep({
  connectors,
  selectedConnector,
  loading,
  error,
  onConnectorSelect,
  onConnectorDoubleClick,
  customConnectors,
  onCreateNew,
  onEditConnector,
}: ConnectorSelectionStepProps) {
  useEffect(() => {
    trackEvent({
      event: 'connector_setup',
      category: 'connector_selection',
      action: 'step',
      label: 'Choose Connector',
    });
  }, []);

  if (loading) {
    return <AppWizardStepLoading variant='grid' />;
  }

  if (error) {
    return (
      <Alert variant='destructive'>
        <AlertCircle className='h-4 w-4' />
        <AlertDescription>Failed to load available connectors. Please try again.</AlertDescription>
      </Alert>
    );
  }

  return (
    <AppWizardStep>
      <AppWizardStepSection title='Choose Connector'>
        <AppWizardGrid>
          {connectors.map(connector => (
            <AppWizardGridItem
              key={connector.name}
              icon={
                connector.logoBase64 ? (
                  <RawBase64Icon base64={connector.logoBase64} size={20} />
                ) : null
              }
              title={connector.displayName}
              selected={!selectedConnector?.isCustom && selectedConnector?.name === connector.name}
              onClick={() => {
                onConnectorSelect(connector);
              }}
              onDoubleClick={() => {
                onConnectorSelect(connector);
                onConnectorDoubleClick?.(connector);
              }}
            />
          ))}
        </AppWizardGrid>
        <InviteTeammatesCard
          variant='inline'
          hint='— Ask someone with access to help you'
          docsLabel='Learn more about Connectors'
          docsHref='https://docs.owox.com/docs/getting-started/setup-guide/connector-data-mart/'
        />
      </AppWizardStepSection>

      {connectors.length === 0 && (
        <AppWizardStepHero
          icon={<Unplug size={56} strokeWidth={1} />}
          title='No connectors available'
          subtitle='Ask your administrator to configure connectors.'
        />
      )}

      <AppWizardStepSection title='Custom Connectors'>
        <AppWizardGrid>
          {customConnectors.map(connector => {
            const isUnpublished = connector.isCustom === true && connector.version === undefined;
            return (
              <div key={connector.id} className='relative'>
                <AppWizardGridItem
                  icon={
                    connector.logoBase64 ? (
                      <RawBase64Icon base64={connector.logoBase64} size={20} />
                    ) : null
                  }
                  title={connector.displayName}
                  selected={!isUnpublished && selectedConnector?.id === connector.id}
                  className={
                    isUnpublished ? 'cursor-not-allowed opacity-50 hover:shadow-none' : undefined
                  }
                  onClick={
                    isUnpublished
                      ? undefined
                      : () => {
                          onConnectorSelect(connector);
                        }
                  }
                  onDoubleClick={
                    isUnpublished
                      ? undefined
                      : () => {
                          onConnectorSelect(connector);
                          onConnectorDoubleClick?.(connector);
                        }
                  }
                />
                {onEditConnector && (
                  <button
                    type='button'
                    aria-label={`Edit ${connector.displayName}`}
                    className='text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-2 right-2 rounded p-1 focus-visible:ring-2 focus-visible:outline-none'
                    onClick={e => {
                      e.stopPropagation();
                      onEditConnector(connector);
                    }}
                  >
                    <Pencil className='h-4 w-4' />
                  </button>
                )}
                {isUnpublished && (
                  <Badge variant='outline' className='absolute top-2 right-9 text-xs'>
                    Publish to use
                  </Badge>
                )}
              </div>
            );
          })}
        </AppWizardGrid>
        <Button variant='outline' onClick={onCreateNew}>
          + Create custom connector
        </Button>
      </AppWizardStepSection>
    </AppWizardStep>
  );
}

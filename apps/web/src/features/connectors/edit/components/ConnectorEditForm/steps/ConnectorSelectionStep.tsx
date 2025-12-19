import { AlertCircle, Unplug } from 'lucide-react';
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

interface ConnectorSelectionStepProps {
  connectors: ConnectorListItem[];
  selectedConnector: ConnectorListItem | null;
  loading: boolean;
  error: string | null;
  onConnectorSelect: (connector: ConnectorListItem) => void;
  onConnectorDoubleClick?: (connector: ConnectorListItem) => void;
}

export function ConnectorSelectionStep({
  connectors,
  selectedConnector,
  loading,
  error,
  onConnectorSelect,
  onConnectorDoubleClick,
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
              selected={selectedConnector?.name === connector.name}
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
      </AppWizardStepSection>

      {connectors.length === 0 && (
        <AppWizardStepHero
          icon={<Unplug size={56} strokeWidth={1} />}
          title='No connectors available'
          subtitle='Ask your administrator to configure connectors.'
        />
      )}
    </AppWizardStep>
  );
}

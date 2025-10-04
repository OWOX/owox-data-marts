import { Skeleton } from '@owox/ui/components/skeleton';
import { AlertCircle, Plug, CodeIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@owox/ui/components/alert';
import type { ConnectorListItem } from '../../../../shared/model/types/connector';
import { RawBase64Icon } from '../../../../../../shared/icons';
import {
  AppWizardStep,
  AppWizardGrid,
  AppWizardGridItem,
  AppWizardStepSection,
} from '@owox/ui/components/common/wizard';

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
  if (loading) {
    return (
      <div className='space-y-4'>
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
          {Array.from({ length: 6 }).map((_, index) => (
            <div className='flex items-center gap-4' key={index}>
              <Skeleton className='h-4 w-3/4' />
              <Skeleton className='h-3 w-1/2' />
            </div>
          ))}
        </div>
      </div>
    );
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
          <AppWizardGridItem
            key='custom-code'
            icon={<CodeIcon className='h-5 w-5' />}
            title='Custom code'
            disabled
          />
        </AppWizardGrid>
      </AppWizardStepSection>

      {connectors.length === 0 && (
        <div className='py-8 text-center'>
          <Plug className='text-muted-foreground mx-auto mb-4 h-12 w-12' />
          <h4 className='text-muted-foreground text-lg font-medium'>No connectors available</h4>
          <p className='text-muted-foreground text-sm'>
            Contact your administrator to add connector configurations.
          </p>
        </div>
      )}
    </AppWizardStep>
  );
}

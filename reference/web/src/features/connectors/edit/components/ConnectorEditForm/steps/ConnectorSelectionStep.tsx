import { Card, CardContent, CardHeader, CardTitle } from '@owox/ui/components/card';
import { Skeleton } from '@owox/ui/components/skeleton';
import { AlertCircle, Plug } from 'lucide-react';
import { Alert, AlertDescription } from '@owox/ui/components/alert';
import type { ConnectorListItem } from '../../../../shared/model/types/connector';
import { RawBase64Icon } from '../../../../../../shared/icons';

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
            <Card key={index}>
              <CardHeader>
                <Skeleton className='h-4 w-3/4' />
                <Skeleton className='h-3 w-1/2' />
              </CardHeader>
              <CardContent>
                <Skeleton className='h-10 w-full' />
              </CardContent>
            </Card>
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
    <div className='space-y-4'>
      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2'>
        {connectors.map(connector => (
          <Card
            key={connector.name}
            className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
              selectedConnector?.name === connector.name
                ? 'ring-primary border-primary'
                : 'hover:border-muted-foreground/25'
            }`}
            onClick={() => {
              onConnectorSelect(connector);
            }}
            onDoubleClick={() => {
              onConnectorSelect(connector);
              onConnectorDoubleClick?.(connector);
            }}
          >
            <CardHeader>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  {connector.logoBase64 && (
                    <RawBase64Icon base64={connector.logoBase64} size={16} />
                  )}
                  <CardTitle className='text-base'>{connector.displayName}</CardTitle>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      {connectors.length === 0 && (
        <div className='py-8 text-center'>
          <Plug className='text-muted-foreground mx-auto mb-4 h-12 w-12' />
          <h4 className='text-muted-foreground text-lg font-medium'>No connectors available</h4>
          <p className='text-muted-foreground text-sm'>
            Contact your administrator to add connector configurations.
          </p>
        </div>
      )}

      <div className='flex flex-col gap-4'>
        <Card className={`bg-muted cursor-pointer transition-all duration-200 hover:shadow-md`}>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>Custom code</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-muted-foreground text-sm'>Coming soon...</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

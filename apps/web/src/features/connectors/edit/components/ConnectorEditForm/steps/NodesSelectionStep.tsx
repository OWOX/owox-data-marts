import { Skeleton } from '@owox/ui/components/skeleton';
import type { ConnectorFieldsResponseApiDto } from '../../../../shared/api/';
import {
  AppWizardStepSection,
  AppWizardStep,
  AppWizardStepCardItem,
} from '@owox/ui/components/common/wizard';
import { OpenIssueLink } from '../components';
import { StepperHeroBlock } from '../components';
import type { ConnectorListItem } from '../../../../shared/model/types/connector';

interface NodesSelectionStepProps {
  connector: ConnectorListItem;
  connectorFields: ConnectorFieldsResponseApiDto[] | null;
  selectedField: string;
  connectorName?: string;
  loading?: boolean;
  onFieldSelect: (fieldName: string) => void;
}

export function NodesSelectionStep({
  connector,
  connectorFields,
  selectedField,
  connectorName,
  loading = false,
  onFieldSelect,
}: NodesSelectionStepProps) {
  const title = connectorName ? `Select node for ${connectorName}` : 'Select node';

  if (loading) {
    return (
      <div className='space-y-4'>
        <h4 className='text-lg font-medium'>{title}</h4>
        <div className='flex flex-col gap-4'>
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className='flex items-center space-x-2'>
              <Skeleton className='h-4 w-4 rounded-full' />
              <Skeleton className='h-4 w-32' />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!connectorFields || connectorFields.length === 0) {
    return (
      <div className='space-y-4'>
        <h4 className='text-lg font-medium'>{title}</h4>
        <p className='text-destructive text-sm'>
          {connectorName ? `No nodes found for ${connectorName}` : 'No nodes found'}
        </p>
        <p className='text-muted-foreground text-muted-foreground text-sm'>
          This connector might not be fully implemented yet or there could be other issues. Please
          create an issue on GitHub to report this problem.
        </p>
      </div>
    );
  }

  return (
    <AppWizardStep>
      <StepperHeroBlock connector={connector} />
      <AppWizardStepSection title={title}>
        {connectorFields.map(field => (
          <AppWizardStepCardItem
            key={field.name}
            type='radio'
            id={field.name}
            name='selectedField'
            value={field.name}
            label={field.overview ?? field.name}
            checked={selectedField === field.name}
            onChange={value => {
              onFieldSelect(value as string);
            }}
            tooltip={
              field.name && (
                <>
                  <p>Table name: {field.destinationName ?? field.name}</p>
                  {field.description && <p>{field.description}</p>}
                  {field.documentation && <p>{field.documentation}</p>}
                </>
              )
            }
            selected={selectedField === field.name}
          />
        ))}

        <OpenIssueLink label='Need another node?' />
      </AppWizardStepSection>
    </AppWizardStep>
  );
}

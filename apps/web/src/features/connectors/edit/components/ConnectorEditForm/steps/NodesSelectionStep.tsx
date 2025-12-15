import type { ConnectorFieldsResponseApiDto } from '../../../../shared/api/';
import {
  AppWizardStepSection,
  AppWizardStep,
  AppWizardStepCardItem,
  AppWizardStepHero,
  AppWizardStepLoading,
  AppWizardStepCards,
} from '@owox/ui/components/common/wizard';
import { OpenIssueLink } from '../components';
import { StepperHeroBlock } from '../components';
import type { ConnectorListItem } from '../../../../shared/model/types/connector';
import { ChevronRight, Unplug } from 'lucide-react';
import { Link } from 'react-router-dom';

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
  const title = connectorName ? `Select data for ${connectorName}` : 'Select data';

  if (loading) {
    return <AppWizardStepLoading variant='list' />;
  }

  if (!connectorFields || connectorFields.length === 0) {
    return (
      <AppWizardStep>
        <StepperHeroBlock connector={connector} />
        <AppWizardStepHero
          icon={<Unplug size={56} strokeWidth={1} />}
          title={connectorName ? `No nodes found for ${connectorName}` : 'No nodes found'}
          subtitle='This connector might not be fully implemented yet or there could be other issues.'
        />
        <OpenIssueLink label='Missing some data?' />
      </AppWizardStep>
    );
  }

  return (
    <AppWizardStep>
      <StepperHeroBlock connector={connector} />
      <AppWizardStepSection title={title}>
        <AppWizardStepCards>
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
                  <div className='flex flex-col gap-2 py-1'>
                    <p>
                      <span className='font-semibold'>Table name:</span>{' '}
                      {field.destinationName ?? field.name}
                    </p>
                    {field.description && (
                      <p>
                        <span className='font-semibold'>Description:</span> {field.description}
                      </p>
                    )}
                    {field.documentation && (
                      <Link
                        to={field.documentation}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='bg-muted/16 hover:bg-muted/20 dark:bg-muted/8 dark:hover:bg-muted/16 flex items-center justify-center gap-1 rounded-sm px-2 py-1 font-semibold'
                      >
                        Read more
                        <ChevronRight className='h-3 w-3' />
                      </Link>
                    )}
                  </div>
                )
              }
              selected={selectedField === field.name}
            />
          ))}
        </AppWizardStepCards>

        <OpenIssueLink label='Missing some data?' />
      </AppWizardStepSection>
    </AppWizardStep>
  );
}

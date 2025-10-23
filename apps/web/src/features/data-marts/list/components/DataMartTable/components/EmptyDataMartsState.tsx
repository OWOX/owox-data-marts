import { useProjectRoute } from '../../../../../../shared/hooks';
import { DataMartPlusIcon } from '../../../../../../shared';
import { GraduationCap, SquarePlay } from 'lucide-react';
import { dataMartPresetsList } from '../../../../shared/utils/data-mart-presets';
import { DataMartDefinitionType } from '../../../../shared';
import {
  EmptyStateCard,
  EmptyStateCardHeader,
  EmptyStateCardTitle,
  EmptyStateCardSubTitle,
  EmptyStateCardIllustration,
  EmptyStateCardContent,
  EmptyStateCardSection,
  EmptyStateCardSectionTitle,
  EmptyStateCardSectionContent,
  EmptyStateCardActionButton,
} from '../../../../../../shared/components/EmptyStateCard';

export function EmptyDataMartsState() {
  const { scope } = useProjectRoute();

  // Split presets for visual grouping
  const connectorPresets = dataMartPresetsList.filter(
    p => p.definitionType === DataMartDefinitionType.CONNECTOR
  );

  const otherPresets = dataMartPresetsList.filter(
    p => p.definitionType !== DataMartDefinitionType.CONNECTOR
  );

  return (
    <EmptyStateCard>
      <EmptyStateCardIllustration>
        <DataMartPlusIcon
          className='animate-icon-entrance'
          aria-label='Data Mart creation illustration'
        />
      </EmptyStateCardIllustration>

      <EmptyStateCardContent>
        <EmptyStateCardHeader>
          <EmptyStateCardTitle>Let’s Build Your First Data&nbsp;Mart</EmptyStateCardTitle>
          <EmptyStateCardSubTitle>
            Choose how you want to start — connect a data source, write an SQL query, or begin with
            a blank setup to explore freely.
          </EmptyStateCardSubTitle>
        </EmptyStateCardHeader>

        {/* Connector-based section */}
        <EmptyStateCardSection>
          <EmptyStateCardSectionTitle>Connect a data source</EmptyStateCardSectionTitle>
          <EmptyStateCardSectionContent>
            {connectorPresets.map(preset => (
              <EmptyStateCardActionButton
                key={preset.key}
                href={scope(`/data-marts/create?preset=${preset.key}`)}
                icon={preset.icon && <preset.icon className='h-4 w-4' />}
                title={preset.title}
                variant='outline'
              />
            ))}
          </EmptyStateCardSectionContent>
        </EmptyStateCardSection>

        {/* SQL-based and Blank */}
        <EmptyStateCardSection>
          <EmptyStateCardSectionTitle>
            Use your SQL skills or start from scratch
          </EmptyStateCardSectionTitle>
          <EmptyStateCardSectionContent>
            {otherPresets.map((preset, index) => (
              <>
                <EmptyStateCardActionButton
                  key={preset.key}
                  href={scope(`/data-marts/create?preset=${preset.key}`)}
                  icon={preset.icon && <preset.icon className='h-4 w-4' />}
                  title={preset.title}
                  variant='outline'
                />
                {index < otherPresets.length - 1 && (
                  <span className='text-muted-foreground text-sm'>or</span>
                )}
              </>
            ))}
          </EmptyStateCardSectionContent>
        </EmptyStateCardSection>

        {/* Help */}
        <EmptyStateCardSection separator={false}>
          <EmptyStateCardSectionContent>
            <EmptyStateCardActionButton
              href='https://www.youtube.com/playlist?list=PLvcNVLV5BVbHHCekyAZBEIVnlC4i1qcHx'
              icon={<SquarePlay className='h-4 w-4' />}
              title='Watch a 2-minute demo'
              variant='ghost'
              target='_blank'
            />
            <EmptyStateCardActionButton
              href='https://docs.owox.com/docs/getting-started/core-concepts/?utm_source=owox_data_marts&utm_medium=empty_data_marts_page&utm_campaign=help_buttons'
              icon={<GraduationCap className='h-4 w-4' />}
              title='Core concepts'
              variant='ghost'
              target='_blank'
            />
          </EmptyStateCardSectionContent>
        </EmptyStateCardSection>
      </EmptyStateCardContent>
    </EmptyStateCard>
  );
}

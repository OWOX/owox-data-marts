import { useProjectRoute } from '../../../../../../shared/hooks';
import { DataMartPlusIcon } from '../../../../../../shared';
import { GraduationCap, SquarePlay } from 'lucide-react';
import {
  AiAssistantHandoff,
  AiAssistantIcons,
  buildMcpPrompt,
  useIsMcpSetupPromoAvailable,
} from '../../../../../mcp-promo';
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
  const { scope, projectId } = useProjectRoute();
  const isAiAvailable = useIsMcpSetupPromoAvailable();

  // Split presets for visual grouping
  const connectorPresets = dataMartPresetsList.filter(
    p => p.definitionType === DataMartDefinitionType.CONNECTOR
  );

  const otherPresets = dataMartPresetsList.filter(
    p => p.definitionType !== DataMartDefinitionType.CONNECTOR
  );

  return (
    <EmptyStateCard className='lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] lg:grid-rows-[auto_1fr] xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,13fr)_minmax(0,7fr)]'>
      <EmptyStateCardIllustration className='lg:col-start-2 lg:row-start-1 lg:w-full 2xl:w-full'>
        <DataMartPlusIcon
          className='animate-icon-entrance'
          aria-label='Data Mart creation illustration'
        />
      </EmptyStateCardIllustration>

      <EmptyStateCardContent className='lg:col-start-1 lg:row-start-1 lg:w-full xl:row-span-2 2xl:w-full'>
        <EmptyStateCardHeader>
          <EmptyStateCardTitle>Let’s Build Your First Data&nbsp;Mart</EmptyStateCardTitle>
          <EmptyStateCardSubTitle>
            A Data&nbsp;Mart is the&nbsp;key element of&nbsp;self-service analytics&nbsp;&mdash; it
            provides both control for&nbsp;data analyst and freedom for&nbsp;business users.
            To&nbsp;get started, connect the source you need or&nbsp;query the&nbsp;data you already
            have in&nbsp;storage
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
            Use existing SQL, Table or start from scratch
          </EmptyStateCardSectionTitle>
          <EmptyStateCardSectionContent>
            {otherPresets.map(preset => (
              <div className='flex items-center gap-4' key={preset.key}>
                <EmptyStateCardActionButton
                  href={scope(`/data-marts/create?preset=${preset.key}`)}
                  icon={preset.icon && <preset.icon className='h-4 w-4' />}
                  title={preset.title}
                  variant='outline'
                />
              </div>
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

      {projectId && isAiAvailable && (
        <section className='relative flex w-full max-w-xl flex-col gap-4 self-start rounded-xl border-b border-gray-200 bg-white p-6 shadow-sm lg:col-start-1 lg:row-start-2 xl:col-start-2 xl:max-w-none dark:border-0 dark:bg-white/6'>
          <AiAssistantIcons size='lg' />
          <div className='flex flex-col gap-1'>
            <h3 className='text-lg font-semibold'>Set it up with AI</h3>
            <p className='text-muted-foreground text-sm'>
              Your AI assistant creates the Data Mart with you, step by step.
            </p>
          </div>
          <AiAssistantHandoff
            layout='block'
            mode='prompt'
            placement='empty_project'
            mcpPart='setup'
            prompt={buildMcpPrompt('empty_project', { projectId })}
          />
        </section>
      )}
    </EmptyStateCard>
  );
}

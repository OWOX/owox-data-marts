import { Input } from '@owox/ui/components/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@owox/ui/components/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import { Columns3, GitMerge, Info, Text } from 'lucide-react';
import type {
  BlendedFieldOverride,
  DataMartRelationship,
} from '../../../shared/types/relationship.types';
import { SourceFieldsTable } from '../DataMartSchemaSettings/SourceFieldsTable';
import { JoinDescriptionForm } from './JoinDescriptionForm';
import { JoinSettingsForm, type JoinSettingsSaveContext } from './JoinSettingsForm';
import type { SourceEntry } from './source-entries';
import type { OutputAliasDraft } from './useOutputAliasDraft';

export type RelationshipDetailsTab = 'fields' | 'join-settings' | 'description';

interface RelationshipDetailsTabsProps {
  relationship: DataMartRelationship;
  /** The joined Data Mart as the Report Fields tab edits it; null until joins are configured. */
  source: SourceEntry | null;
  /** The Data Mart whose reports use this join — it owns the Report Fields settings. */
  dataMartId: string;
  /** Aliases used by other relationships that share the same source data mart. */
  siblingAliases: string[];
  readOnly: boolean;
  /**
   * Set for a join inherited through another data mart: its join settings are edited there, and
   * the Description tab edits a per-join override.
   */
  inheritedFrom: { id: string; title: string } | null;
  activeTab: RelationshipDetailsTab;
  onActiveTabChange: (tab: RelationshipDetailsTab) => void;
  outputAlias: OutputAliasDraft;
  onRelationshipUpdated: (updated: DataMartRelationship, context: JoinSettingsSaveContext) => void;
  /**
   * Fired by the Description tab's autosave. Kept apart from `onRelationshipUpdated` because it
   * runs while the user is still typing: the parent must update the relationship in place, not
   * reload it (which would unmount the focused field).
   */
  onRelationshipDescriptionSaved: (updated: DataMartRelationship) => void;
  onFieldOverrideChange: (
    source: SourceEntry,
    fieldName: string,
    override: Partial<BlendedFieldOverride>
  ) => void;
  onDescriptionOverrideChange: (source: SourceEntry, description: string) => void;
  /** Applied to the row that holds the tab list. */
  tabListClassName?: string;
}

/** The Report Fields, Join Settings and Description tabs of one join. */
export function RelationshipDetailsTabs({
  relationship,
  source,
  dataMartId,
  siblingAliases,
  readOnly,
  inheritedFrom,
  activeTab,
  onActiveTabChange,
  outputAlias,
  onRelationshipUpdated,
  onRelationshipDescriptionSaved,
  onFieldOverrideChange,
  onDescriptionOverrideChange,
  tabListClassName,
}: RelationshipDetailsTabsProps) {
  const isInherited = inheritedFrom !== null;

  return (
    <Tabs
      value={activeTab}
      onValueChange={value => {
        onActiveTabChange(value as RelationshipDetailsTab);
      }}
    >
      <div className={cn('flex items-center gap-3 px-4 pt-3', tabListClassName)}>
        <TabsList className='shrink-0'>
          <TabsTrigger value='fields'>
            <Columns3 className='h-4 w-4' />
            Report Fields
          </TabsTrigger>
          <TabsTrigger value='join-settings'>
            <GitMerge className='h-4 w-4' />
            Join Settings
          </TabsTrigger>
          <TabsTrigger value='description'>
            <Text className='h-4 w-4' />
            Description
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value='fields' className='px-4 pt-2 pb-2'>
        {source ? (
          <SourceFieldsTable
            fields={source.fields}
            onFieldOverrideChange={(fieldName, override) => {
              onFieldOverrideChange(source, fieldName, override);
            }}
            leadingToolbar={
              <div
                className='bg-muted/50 flex flex-col gap-1.5 rounded-md p-3 dark:bg-white/5'
                onClick={e => {
                  e.stopPropagation();
                }}
              >
                <label className='flex items-center gap-1.5 text-sm font-medium'>
                  Output Alias
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className='text-muted-foreground/50 hover:text-muted-foreground shrink-0 transition-colors'>
                        <Info className='size-4 shrink-0' />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side='top' className='max-w-xs'>
                      Short name that appears in the output data schema for fields from this data
                      mart.
                    </TooltipContent>
                  </Tooltip>
                </label>
                <Input
                  value={outputAlias.value}
                  onChange={e => {
                    outputAlias.onChange(e.target.value);
                  }}
                  onBlur={outputAlias.onBlur}
                  placeholder='e.g. campaign_performance'
                  className='bg-background h-8 text-sm dark:bg-white/5'
                />
              </div>
            }
          />
        ) : (
          <p className='text-muted-foreground py-4 text-sm'>
            Fields will appear after configuring join conditions.
          </p>
        )}
      </TabsContent>

      <TabsContent value='join-settings'>
        <JoinSettingsForm
          relationship={relationship}
          dataMartId={dataMartId}
          readOnly={readOnly || isInherited}
          siblingAliases={siblingAliases}
          inheritedFrom={inheritedFrom}
          onSaved={onRelationshipUpdated}
        />
      </TabsContent>

      <TabsContent value='description'>
        <JoinDescriptionForm
          relationship={relationship}
          dataMartId={dataMartId}
          // An inherited join without a source entry (join conditions not configured yet) has
          // nowhere to store an override, so it stays read-only.
          readOnly={readOnly || (isInherited && !source)}
          inheritedFrom={inheritedFrom}
          override={
            isInherited && source
              ? {
                  value: source.descriptionOverride ?? '',
                  onChange: description => {
                    onDescriptionOverrideChange(source, description);
                  },
                }
              : undefined
          }
          onSaved={onRelationshipDescriptionSaved}
        />
      </TabsContent>
    </Tabs>
  );
}

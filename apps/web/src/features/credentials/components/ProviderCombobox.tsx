import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from '@owox/ui/components/combobox';
import { InputGroupAddon } from '@owox/ui/components/input-group';
import { cn } from '@owox/ui/lib/utils';
import { KeyRound } from 'lucide-react';
import {
  AwsAthenaIcon,
  ChatGPTIcon,
  ClaudeIcon,
  DatabricksIcon,
  GeminiIcon,
  GitHubIcon,
  GoogleBigQueryIcon,
  GoogleChatIcon,
  GoogleCloudIcon,
  GoogleSheetsIcon,
  OpenRouterIcon,
  SnowflakeIcon,
  type AppIcon,
} from '../../../shared';
import type { CredentialCategory, CredentialDefinition, CredentialIcon } from '../types';

export interface ProviderOption {
  id: string;
  displayName: string;
  category?: CredentialCategory;
  icon?: CredentialIcon | null;
}

interface ProviderGroup {
  value: string;
  items: ProviderOption[];
}

const GROUPS: { category: CredentialCategory; label: string }[] = [
  { category: 'ai', label: 'AI' },
  { category: 'google', label: 'Google' },
  { category: 'aws', label: 'AWS' },
  { category: 'snowflake', label: 'Snowflake' },
  { category: 'databricks', label: 'Databricks' },
  { category: 'other', label: 'Other' },
];

const ICONS: Partial<Record<CredentialIcon, AppIcon>> = {
  google: GoogleBigQueryIcon,
  'google-cloud': GoogleCloudIcon,
  'google-sheets': GoogleSheetsIcon,
  'google-chat': GoogleChatIcon,
  aws: AwsAthenaIcon,
  snowflake: SnowflakeIcon,
  databricks: DatabricksIcon,
  openai: ChatGPTIcon,
  anthropic: ClaudeIcon,
  gemini: GeminiIcon,
  openrouter: OpenRouterIcon,
  github: GitHubIcon,
};

/** The icon of a provider's icon key; a generic key when it has none or this build does not know it. */
export function ProviderIcon({
  icon,
  className,
}: {
  icon?: CredentialIcon | null;
  className?: string;
}) {
  const Icon: AppIcon = (icon && ICONS[icon]) ?? KeyRound;
  // Brand icons take no aria props, so the wrapper hides them.
  return (
    <span aria-hidden='true' className={cn('inline-flex shrink-0', className)}>
      <Icon size={16} />
    </span>
  );
}

/** The group a provider shows under; a group this build does not know yet shows under Other. */
function groupLabel(option: ProviderOption): string {
  return GROUPS.find(({ category }) => category === option.category)?.label ?? 'Other';
}

function groupProviders(options: readonly ProviderOption[]): ProviderGroup[] {
  return GROUPS.map(({ label }) => ({
    value: label,
    items: options.filter(option => groupLabel(option) === label),
  })).filter(group => group.items.length > 0);
}

/** Matches the name of a provider or of its group, so "google" finds every Google provider. */
function matchesProvider(option: ProviderOption, query: string): boolean {
  const needle = query.toLowerCase();
  return [option.displayName, groupLabel(option)].some(text => text.toLowerCase().includes(needle));
}

interface ProviderComboboxProps {
  definitions: readonly (CredentialDefinition | ProviderOption)[];
  value: string;
  onChange: (id: string) => void;
  'aria-invalid'?: boolean;
  id?: string;
  'aria-describedby'?: string;
}

export function ProviderCombobox({
  definitions,
  value,
  onChange,
  'aria-invalid': ariaInvalid,
  id,
  'aria-describedby': ariaDescribedBy,
}: ProviderComboboxProps) {
  const groups = groupProviders(definitions);
  const selected = definitions.find(option => option.id === value) ?? null;

  return (
    <Combobox<ProviderOption>
      items={groups}
      value={selected}
      onValueChange={option => {
        if (option) onChange(option.id);
      }}
      itemToStringLabel={option => option.displayName}
      filter={matchesProvider}
      isItemEqualToValue={(a, b) => a.id === b.id}
    >
      <ComboboxInput
        id={id}
        aria-label='Provider'
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        placeholder='Select a provider'
        className='w-full'
      >
        {selected && (
          <InputGroupAddon align='inline-start'>
            <ProviderIcon icon={selected.icon} />
          </InputGroupAddon>
        )}
      </ComboboxInput>
      <ComboboxContent>
        <ComboboxEmpty>No providers found</ComboboxEmpty>
        <ComboboxList>
          {(group: ProviderGroup) => (
            <ComboboxGroup key={group.value} items={group.items}>
              <ComboboxLabel>{group.value}</ComboboxLabel>
              <ComboboxCollection>
                {(option: ProviderOption) => (
                  <ComboboxItem key={option.id} value={option}>
                    <ProviderIcon icon={option.icon} className='mr-2 align-text-bottom' />
                    {option.displayName}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

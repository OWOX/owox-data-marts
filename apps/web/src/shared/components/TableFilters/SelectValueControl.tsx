import { useComboboxAnchor } from '@owox/ui/components/combobox';
import {
  Combobox,
  ComboboxChips,
  ComboboxChip,
  ComboboxValue,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@owox/ui/components/combobox';
import type { SelectOption } from './collectOptions.utils';
import type { FilterConfigItem } from './types';

interface SelectValueControlProps {
  configItem: FilterConfigItem | undefined;
  value: string[];
  onChange: (value: string[]) => void;
}

export function SelectValueControl({ configItem, value, onChange }: SelectValueControlProps) {
  const anchorRef = useComboboxAnchor();
  const items = (configItem?.options ?? []) as SelectOption[];
  const isDisabled = !configItem;

  return (
    <Combobox
      multiple
      items={items}
      value={value}
      onValueChange={onChange}
      autoHighlight
      disabled={isDisabled}
    >
      <ComboboxChips ref={anchorRef} className='min-w-[160px]'>
        <ComboboxValue>
          {values => (
            <>
              {(values as string[]).map(v => {
                const label = items.find(o => o.value === v)?.label ?? v;
                return <ComboboxChip key={v}>{label}</ComboboxChip>;
              })}
              <ComboboxChipsInput placeholder={isDisabled ? 'Value' : ''} />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>

      <ComboboxContent anchor={anchorRef}>
        <ComboboxEmpty>No options</ComboboxEmpty>
        <ComboboxList>
          {item => {
            const option = item as SelectOption;
            return (
              <ComboboxItem key={option.value} value={option.value}>
                {option.label}
              </ComboboxItem>
            );
          }}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

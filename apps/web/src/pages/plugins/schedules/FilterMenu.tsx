import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import type { FilterOption } from './filterOptions';

const ALL = '__all__';

/** One choice, or All; the button names the choice. */
export function FilterMenu({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: readonly FilterOption[];
  onChange: (value: string | null) => void;
}) {
  const current = options.find(option => option.value === value)?.label ?? 'All';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' size='sm'>
          {label}: {current}
          <ChevronDown className='size-4' aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start'>
        <DropdownMenuRadioGroup
          value={value ?? ALL}
          onValueChange={next => {
            onChange(next === ALL ? null : next);
          }}
        >
          <DropdownMenuRadioItem value={ALL}>All</DropdownMenuRadioItem>
          {options.map(option => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Several choices; none is All. The menu stays open while they are toggled. */
export function MultiFilterMenu({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: readonly string[];
  options: readonly FilterOption[];
  onChange: (values: string[]) => void;
}) {
  const chosen = options.filter(option => values.includes(option.value));
  const summary =
    chosen.length === 0
      ? 'All'
      : chosen.length === 1
        ? chosen[0].label
        : `${String(chosen.length)} selected`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' size='sm'>
          {label}: {summary}
          <ChevronDown className='size-4' aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start'>
        <DropdownMenuCheckboxItem
          checked={values.length === 0}
          onSelect={event => {
            event.preventDefault();
          }}
          onCheckedChange={() => {
            onChange([]);
          }}
        >
          All
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {options.map(option => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={values.includes(option.value)}
            onSelect={event => {
              event.preventDefault();
            }}
            onCheckedChange={checked => {
              onChange(
                checked ? [...values, option.value] : values.filter(item => item !== option.value)
              );
            }}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

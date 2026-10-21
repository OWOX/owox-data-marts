import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { getRoleDisplayName } from '../../features/idp/utils/role-display-name';
import type { Role } from '../../features/project-members/types';

// Highest access first, matching the role help on the Members page.
const ROLE_OPTIONS: { role: Role; description: string }[] = [
  { role: 'admin', description: 'Everything, plus members, billing and project settings.' },
  { role: 'editor', description: 'Connects storages and builds Data Marts.' },
  { role: 'viewer', description: 'Builds reports from Data Marts shared with them.' },
];

interface InviteRolePickerProps {
  value: Role;
  onChange: (role: Role) => void;
  disabled?: boolean;
}

export function InviteRolePicker({ value, onChange, disabled = false }: InviteRolePickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          type='button'
          variant='outline'
          className='w-full justify-between sm:w-44'
          aria-label={`Role: ${getRoleDisplayName(value)}`}
        >
          {getRoleDisplayName(value)}
          <ChevronDown className='text-muted-foreground h-4 w-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-72'>
        {ROLE_OPTIONS.map(option => (
          <DropdownMenuItem
            key={option.role}
            role='menuitemradio'
            aria-checked={option.role === value}
            onSelect={() => {
              onChange(option.role);
            }}
            className='items-start py-2'
          >
            <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
              <span className='font-medium'>{getRoleDisplayName(option.role)}</span>
              <span className='text-muted-foreground text-xs'>{option.description}</span>
            </div>
            {option.role === value && <Check className='mt-0.5 h-4 w-4' aria-hidden='true' />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

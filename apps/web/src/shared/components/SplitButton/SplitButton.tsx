import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@owox/ui/components/button';
import { ButtonGroup } from '@owox/ui/components/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { ChevronDown } from 'lucide-react';

interface SplitButtonProps extends ComponentProps<typeof Button> {
  /** Class of the group that holds the main button and the menu chevron. */
  groupClassName?: string;
  /** The menu items behind the chevron; without them the main button stands alone in the group. */
  menu?: ReactNode;
}

/** A main action with its alternatives in a menu that opens above it. */
export function SplitButton({ groupClassName, menu, disabled, ...props }: SplitButtonProps) {
  return (
    <ButtonGroup className={groupClassName}>
      <Button variant='default' {...props} disabled={disabled} />
      {menu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant='default'
              type='button'
              disabled={disabled}
              aria-label='More actions'
              className='group'
            >
              <ChevronDown
                className='size-4 transition-transform duration-200 group-data-[state=open]:rotate-180'
                aria-hidden='true'
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' side='top'>
            {menu}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </ButtonGroup>
  );
}

import { NavLink } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useProjectRoute } from '../../../shared/hooks';

export function ActionButton() {
  const { scope } = useProjectRoute();

  return (
    <NavLink
      to={scope('/data-marts/create')}
      data-sidebar='menu-button'
      data-size='md'
      className={`peer/menu-button ring-sidebar-ring bg-primary hover:bg-primary-hover text-primary-foreground hover:text-primary-foreground flex h-8 w-full items-center gap-2 overflow-hidden rounded-full p-2 text-left text-sm outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0! focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0`}
    >
      <div className='flex aspect-square size-8 items-center justify-center'>
        <Plus className='size-4 shrink-0' />
      </div>

      <div className='grid flex-1 text-left text-sm leading-tight'>
        <span className='truncate font-medium'>New Data Mart</span>
      </div>
    </NavLink>
  );
}

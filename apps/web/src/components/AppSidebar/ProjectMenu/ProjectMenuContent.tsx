import { Link } from 'react-router';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@owox/ui/components/dropdown-menu';
import { SwitchProjectMenu } from './SwitchProjectMenu';
import { useProjectMenu } from './useProjectMenu';
import { useProjectRoute } from '../../../shared/hooks';

export function ProjectMenuContent() {
  const { visibleMenuItems, canSwitchProject } = useProjectMenu();
  const { scope } = useProjectRoute();

  return (
    <DropdownMenuContent align='start' side='right' className='w-56'>
      {visibleMenuItems.map((item, index) => {
        if (item.type === 'separator') {
          return <DropdownMenuSeparator key={`separator-${String(index)}`} />;
        }
        const Icon = item.icon;

        if (item.internal) {
          return (
            <DropdownMenuItem key={item.href} asChild>
              <Link to={scope(item.href)} className='flex items-center gap-2'>
                <Icon className='size-4' />
                {item.title}
              </Link>
            </DropdownMenuItem>
          );
        }

        return (
          <DropdownMenuItem key={item.href} asChild>
            <a
              href={item.href}
              target='_blank'
              rel='noopener noreferrer'
              className='flex items-center gap-2'
            >
              <Icon className='size-4' />
              {item.title}
            </a>
          </DropdownMenuItem>
        );
      })}
      {canSwitchProject && <SwitchProjectMenu key='switch-project' />}
    </DropdownMenuContent>
  );
}

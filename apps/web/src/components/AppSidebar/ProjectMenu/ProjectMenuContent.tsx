import type { FC } from 'react';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@owox/ui/components/dropdown-menu';
import { projectMenuItems } from './items';
import type { ProjectMenuItem } from './types';
import { SwitchProjectMenuItem } from './SwitchProjectMenuItem';

export const ProjectMenuContent: FC = () => {
  return (
    <DropdownMenuContent align='start' sideOffset={8} className='w-56'>
      {projectMenuItems
        .filter(item => item.visible)
        .map((item: ProjectMenuItem, index) => {
          if (item.type === 'separator') {
            return <DropdownMenuSeparator key={`separator-${String(index)}`} />;
          }

          if (item.type === 'switcher') {
            return (
              <SwitchProjectMenuItem title={item.title} icon={item.icon} key='switch-project' />
            );
          }

          const Icon = item.icon;

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
    </DropdownMenuContent>
  );
};

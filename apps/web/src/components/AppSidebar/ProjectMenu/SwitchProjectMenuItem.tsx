import type { FC } from 'react';
import { useState } from 'react';
import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuItem,
  DropdownMenuPortal,
} from '@owox/ui/components/dropdown-menu';
import { Check } from 'lucide-react';

interface Project {
  title: string;
  href: string;
  isCurrent: boolean;
}

interface SwitchProjectMenuItemProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const SwitchProjectMenuItem: FC<SwitchProjectMenuItemProps> = ({ title, icon: Icon }) => {
  // Temporary project list; replace with API call later
  const [projects] = useState<Project[]>([
    { title: 'Project 1', href: '/project-1', isCurrent: true },
    { title: 'Project 2', href: '/project-2', isCurrent: false },
    { title: 'Project 3', href: '/project-3', isCurrent: false },
  ]);

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className='flex items-center gap-2'>
        <Icon className='h-4 w-4' />
        {title}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent>
          {projects.map(project => (
            <DropdownMenuItem asChild key={project.href}>
              <a href={project.href} className='flex items-center gap-2'>
                {project.isCurrent ? <Check className='h-4 w-4' /> : <span className='h-4 w-4' />}
                {project.title}
              </a>
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
};

import { ArrowRight, CheckCircle2, CircleArrowRight } from 'lucide-react';
import type { GroupProgress } from './types';

interface SetupChecklistGroupProps {
  groupProgress: GroupProgress;
  onClick: () => void;
}

export function SetupChecklistGroup({ groupProgress, onClick }: SetupChecklistGroupProps) {
  const { group, status } = groupProgress;

  const renderIcon = () => {
    switch (status) {
      case 'done':
        return <CheckCircle2 className='text-muted-foreground/50 size-4 shrink-0' />;
      case 'in_progress':
        return <CircleArrowRight className='text-muted-foreground size-4 shrink-0' />;
      case 'not_started':
      default:
        return <ArrowRight className='text-muted-foreground size-4 shrink-0' />;
    }
  };

  return (
    <button
      type='button'
      onClick={onClick}
      className={`hover:bg-sidebar-accent flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
        status === 'done' ? 'text-muted-foreground/50' : ''
      }`}
    >
      {renderIcon()}
      <span
        className={`transition-all duration-300 ${
          status === 'done' ? 'line-through' : 'text-sidebar-foreground'
        }`}
      >
        {group.title}
      </span>
    </button>
  );
}

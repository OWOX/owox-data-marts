import { cn } from '@owox/ui/lib/utils';

export interface CollapsibleCardHeaderActionsProps {
  children: React.ReactNode;
  className?: string;
}

export function CollapsibleCardHeaderActions({
  children,
  className,
}: CollapsibleCardHeaderActionsProps) {
  const handleClick = (e: React.MouseEvent) => {
    // Prevent the click event from bubbling up to the header
    // This stops the card from collapsing when clicking on action buttons
    e.stopPropagation();
  };

  return (
    <div className={cn('flex items-center gap-2 self-center', className)} onClick={handleClick}>
      {children}
    </div>
  );
}

CollapsibleCardHeaderActions.displayName = 'CollapsibleCardHeaderActions';

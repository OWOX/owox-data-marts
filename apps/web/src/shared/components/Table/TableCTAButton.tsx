import { type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@owox/ui/components/button';

interface TableCTAButtonProps {
  children: ReactNode;
  onClick?: () => void;
  asChild?: boolean;
  disabled?: boolean;
}

export function TableCTAButton({
  children,
  onClick,
  asChild = false,
  disabled,
}: TableCTAButtonProps) {
  return (
    <Button
      variant='outline'
      className='border-muted dark:border-muted/50 flex cursor-pointer items-center gap-2 bg-white hover:bg-white dark:bg-white/4 dark:hover:bg-white/8'
      onClick={onClick}
      asChild={asChild}
      disabled={disabled}
    >
      {asChild ? (
        children
      ) : (
        <>
          <Plus className='h-4 w-4' />
          {children}
        </>
      )}
    </Button>
  );
}

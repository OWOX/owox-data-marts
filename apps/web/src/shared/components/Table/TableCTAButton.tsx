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
      className='dm-card-toolbar-btn-primary'
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

import { CardFooter } from '@owox/ui/components/card';

export interface CollapsibleCardFooterProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
}

export function CollapsibleCardFooter({ left, right }: CollapsibleCardFooterProps) {
  // Render the footer area with left and right sections
  return (
    <CardFooter className='flex items-center gap-2 px-4 py-4'>
      <div className='flex flex-grow items-center gap-2'>{left}</div>
      {right && <div className='flex items-center'>{right}</div>}
    </CardFooter>
  );
}
CollapsibleCardFooter.displayName = 'CollapsibleCardFooter';

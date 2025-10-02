import { CardContent } from '@owox/ui/components/card';

export function CollapsibleCardContent({ children }: { children: React.ReactNode }) {
  // Render the main content area of the card
  return <CardContent className='px-4 pt-1'>{children}</CardContent>;
}
CollapsibleCardContent.displayName = 'CollapsibleCardContent';

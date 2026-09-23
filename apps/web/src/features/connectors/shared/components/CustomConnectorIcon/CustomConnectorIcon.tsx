import { Blocks } from 'lucide-react';

interface CustomConnectorIconProps {
  size?: number;
}

export function CustomConnectorIcon({ size = 24 }: CustomConnectorIconProps) {
  return (
    <Blocks
      className='text-muted-foreground shrink-0'
      size={size}
      strokeWidth={1.5}
      role='img'
      aria-label='Custom connector'
    />
  );
}

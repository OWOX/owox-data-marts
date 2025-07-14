import { GripVertical } from 'lucide-react';
import type { HTMLAttributes } from 'react';

interface SchemaFieldDragHandleProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function SchemaFieldDragHandle({ className = '', ...props }: SchemaFieldDragHandleProps) {
  return (
    <div
      {...props}
      className={`flex cursor-grab items-center justify-center opacity-0 group-hover:opacity-100 active:cursor-grabbing ${className}`}
    >
      <GripVertical className='h-4 w-4 text-gray-400' />
    </div>
  );
}

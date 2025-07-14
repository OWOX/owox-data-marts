import { TableCell, TableRow } from '@owox/ui/components/table';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ReactNode } from 'react';
import * as React from 'react';
import { SchemaFieldDragHandle } from '../fields/SchemaFieldDragHandle.tsx';

interface SortableTableRowProps<T = unknown> {
  id: string | number;
  row?: T;
  children: ReactNode;
}

export function SortableTableRow<T>({ id, children }: SortableTableRowProps<T>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.75 : 1,
  };

  // Convert children to array to manipulate them
  const childrenArray = React.Children.toArray(children);

  // Replace the first cell with our custom cell containing the drag handle
  const updatedChildren = [
    <TableCell
      key='drag-handle-cell'
      className='bg-background dark:bg-muted'
      style={{
        width: 20,
        position: 'sticky',
        left: 0,
        zIndex: 2,
        paddingTop: 8,
        paddingBottom: 8,
        paddingLeft: 4,
        paddingRight: 0,
      }}
    >
      <SchemaFieldDragHandle {...attributes} {...listeners} />
    </TableCell>,
    ...childrenArray.slice(1),
  ];

  return (
    <TableRow ref={setNodeRef} style={style} className='group'>
      {updatedChildren}
    </TableRow>
  );
}

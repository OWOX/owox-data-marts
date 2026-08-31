import { Button } from '@owox/ui/components/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@owox/ui/components/table';
import { EditableText } from '@owox/ui/components/common/editable-text';
import { SortableTableRow } from '@owox/ui/components/common/sortable-table-row';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CircleAlert, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useBuilder } from '../../../shared/model/hooks/useBuilder';
import { FieldInfo, InfoLabel } from '../fields';

/** One editable key→value row with a stable client id (keeps focus/order while the key,
 * which is the manifest map key, is edited, dragged or left temporarily blank). */
interface Row {
  id: number;
  key: string;
  value: string;
}

/** Query parameters as a drag-orderable, inline-editable table — same look as the Parameters
 * editor, without the search box. Writes to `[...basePath, 'queryParameters']`; `scope`
 * (e.g. "submit"/"poll") disambiguates the aria-labels and testid when several are on screen. */
export function QueryParametersEditor({
  query,
  basePath,
  scope,
}: {
  query: Record<string, string>;
  basePath: (string | number)[];
  scope?: string;
}) {
  const { setPath } = useBuilder();

  const idSeq = useRef(0);
  const seed = (q: Record<string, string>): Row[] =>
    Object.entries(q).map(([key, value]) => ({ id: ++idSeq.current, key, value }));

  const [rows, setRows] = useState<Row[]>(() => seed(query));
  const lastCommitted = useRef(JSON.stringify(query));

  useEffect(() => {
    const incoming = JSON.stringify(query);
    if (incoming !== lastCommitted.current) {
      lastCommitted.current = incoming;
      setRows(seed(query));
    }
  }, [query]);

  const commit = (next: Row[]) => {
    setRows(next);
    const record: Record<string, string> = {};
    for (const r of next) {
      const key = r.key.trim();
      if (key) record[key] = r.value;
    }
    lastCommitted.current = JSON.stringify(record);
    setPath([...basePath, 'queryParameters'], Object.keys(record).length ? record : undefined);
  };

  const addAria = scope ? `Add ${scope} query parameter` : 'Add query parameter';
  const removeAria = (key: string) => `Remove ${scope ? `${scope} ` : ''}query ${key}`;

  const setKey = (id: number, key: string) => {
    commit(rows.map(r => (r.id === id ? { ...r, key } : r)));
  };
  const setValue = (id: number, value: string) => {
    commit(rows.map(r => (r.id === id ? { ...r, value } : r)));
  };
  const addRow = () => {
    commit([...rows, { id: ++idSeq.current, key: '', value: '' }]);
  };
  const removeRow = (id: number) => {
    commit(rows.filter(r => r.id !== id));
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex(r => r.id === active.id);
    const newIndex = rows.findIndex(r => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    commit(arrayMove(rows, oldIndex, newIndex));
  };

  return (
    <div
      className='flex flex-col gap-2'
      data-testid={scope ? `query-parameters-${scope}` : 'query-parameters'}
    >
      <div className='flex items-center justify-between'>
        <InfoLabel hint='Key–value pairs added to the request URL. Values can reference parameters, e.g. {{ parameters.X }}.'>
          Query parameters
        </InfoLabel>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={addRow}
          aria-label={addAria}
          className='gap-1.5'
        >
          <Plus className='h-4 w-4' /> Add
        </Button>
      </div>

      <div className='bg-card overflow-hidden rounded-md border'>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <Table>
            <TableHeader>
              <TableRow className='bg-muted/50 hover:bg-muted/50'>
                <TableHead className='w-[20px]' />
                <TableHead className='w-[36px]' />
                <TableHead className='text-muted-foreground min-w-[160px] text-[11px]'>
                  <span className='flex items-center gap-1.5'>
                    Key <FieldInfo hint='Query-string parameter name added to the URL.' />
                  </span>
                </TableHead>
                <TableHead className='text-muted-foreground min-w-[200px] text-[11px]'>
                  <span className='flex items-center gap-1.5'>
                    Value <FieldInfo hint='Static text or a template like {{ parameters.X }}.' />
                  </span>
                </TableHead>
                <TableHead className='w-[44px]' />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow className='hover:bg-transparent'>
                  <TableCell
                    colSpan={5}
                    className='text-muted-foreground py-6 text-center text-[13px]'
                  >
                    No query parameters yet — add one above.
                  </TableCell>
                </TableRow>
              ) : (
                <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
                  {rows.map(row => {
                    const blank = row.key.trim() === '';
                    return (
                      <SortableTableRow key={row.id} id={row.id}>
                        {/* first cell is replaced by the drag handle */}
                        <TableCell />
                        <TableCell className='text-center' data-testid={`query-${row.key}`}>
                          {blank && (
                            <CircleAlert
                              className='mx-auto h-4 w-4 text-red-500'
                              aria-label='Parameter key is required'
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <EditableText
                            value={row.key}
                            onValueChange={v => {
                              setKey(row.id, v);
                            }}
                            placeholder='Parameter key'
                            isBold
                            className='font-mono'
                          />
                        </TableCell>
                        <TableCell>
                          <EditableText
                            value={row.value}
                            onValueChange={v => {
                              setValue(row.id, v);
                            }}
                            placeholder='{{ parameters.X }}'
                            className='font-mono'
                          />
                        </TableCell>
                        <TableCell className='text-center'>
                          <Button
                            type='button'
                            variant='ghost'
                            size='icon'
                            onClick={() => {
                              removeRow(row.id);
                            }}
                            aria-label={removeAria(row.key)}
                            className='text-muted-foreground h-8 w-8'
                          >
                            <Trash2 className='h-[15px] w-[15px]' />
                          </Button>
                        </TableCell>
                      </SortableTableRow>
                    );
                  })}
                </SortableContext>
              )}
            </TableBody>
          </Table>

          <Button
            type='button'
            variant='ghost'
            onClick={addRow}
            aria-label={addAria}
            className='text-muted-foreground h-10 w-full justify-center gap-1.5 rounded-none border-t'
          >
            <Plus className='h-4 w-4' /> Add parameter
          </Button>
        </DndContext>
      </div>
    </div>
  );
}

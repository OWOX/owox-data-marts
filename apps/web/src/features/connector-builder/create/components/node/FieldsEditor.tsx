import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { Checkbox } from '@owox/ui/components/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
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
import type { ManifestField, ManifestNode } from '../../../shared/model/manifest.types';
import { inferFieldsFromSample } from '../../../shared/model/inferFields';
import { flattenPaths } from '../../../shared/model/pathSuggest';
import { FieldInfo } from '../fields';

const FIELD_TYPES = ['string', 'integer', 'number', 'boolean', 'date', 'datetime', 'object'];

const DUPLICATE_HINT =
  'Another field already uses this name — only the last one will be saved. Rename or remove one of them.';

/** One output field with a stable client id so rows keep focus/order while dragging. `pk`/`default`
 * mirror membership in the node's uniqueKeys / defaultFields lists. */
interface Row {
  id: number;
  name: string;
  field: ManifestField;
  pk: boolean;
  default: boolean;
}

/**
 * The manifest form of a row's field: surrounding whitespace gone, and a value that is
 * only whitespace dropped entirely.
 *
 * Normalising here rather than in the input handlers is what lets those inputs hold a
 * half-typed value with a trailing space. It is also why the re-seed effect does not fight
 * back: `lastCommitted` is stamped from this same normalised shape, so reading the manifest
 * back produces an identical string and the rows are left alone.
 */
function trimmedField(field: ManifestField): ManifestField {
  // `?? undefined` would not do: the value being dropped is the EMPTY STRING left behind by
  // trimming, which nullish coalescing passes straight through.
  const blankToUndefined = (value: string | undefined) => {
    const trimmed = value?.trim();
    return trimmed === '' ? undefined : trimmed;
  };
  return {
    ...field,
    dataPath: blankToUndefined(field.dataPath),
    description: blankToUndefined(field.description),
  };
}

/** "Discover fields" needs an actual record to infer from. The sample must be for this
 * node and carry at least one record — otherwise the button is enabled but does nothing. */
export function hasUsableSample(
  sample: { node: string; records: Record<string, unknown>[] } | null,
  nodeName: string
): boolean {
  return sample?.node === nodeName && sample.records.length > 0;
}

/** `T` with the keys in `K` admitted as possibly-absent. */
type Loosen<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * A node as it actually arrives here, before anything has validated it. Code mode is a
 * first-class authoring surface (and the shape an MCP-authored manifest can arrive in),
 * and `parseManifestJson` normalizes only the top level — so a node body reaches this
 * editor verbatim and may carry no `fields` at all. The engine never inspects `fields`
 * during parsing, so such a connector runs; `ManifestNode` still declares `fields` as
 * required, so read the node through a shape that admits its absence instead of trusting
 * the declared type.
 */
type UnvalidatedNode = Loosen<ManifestNode, 'fields'>;

export function FieldsEditor({ nodeName }: { nodeName: string }) {
  const { manifest, setPath, state } = useBuilder();
  const nodes: Record<string, UnvalidatedNode> = manifest.nodes;
  const node = nodes[nodeName];
  // No `fields` yet reads as no fields, which is what an empty `fields` object already shows.
  const fields = node.fields ?? {};
  const base = ['nodes', nodeName] as (string | number)[];

  const listId = `paths-${nodeName}`;
  const hasSample = hasUsableSample(state.sample, nodeName);
  const suggestions = state.sample?.node === nodeName ? flattenPaths(state.sample.records[0]) : [];

  const idSeq = useRef(0);
  const seed = (): Row[] =>
    Object.entries(fields).map(([name, field]) => ({
      id: ++idSeq.current,
      name,
      field,
      pk: (node.uniqueKeys ?? []).includes(name),
      default: (node.defaultFields ?? []).includes(name),
    }));

  const [rows, setRows] = useState<Row[]>(seed);
  const snapshot = () =>
    JSON.stringify({ f: fields, u: node.uniqueKeys ?? [], d: node.defaultFields ?? [] });
  const lastCommitted = useRef(snapshot());

  useEffect(() => {
    const incoming = JSON.stringify({
      f: fields,
      u: node.uniqueKeys ?? [],
      d: node.defaultFields ?? [],
    });
    if (incoming !== lastCommitted.current) {
      lastCommitted.current = incoming;
      setRows(seed());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.fields, node.uniqueKeys, node.defaultFields]);

  // Rebuild fields + uniqueKeys + defaultFields from the working rows. Blank names are
  // skipped. Two rows can carry the same name (flagged in the table, see `duplicateNames`);
  // `fieldsRec` collapses those to one entry by construction, so uniqueKeys/defaultFields
  // must not list the shared name once per row — the manifest would then declare the same
  // column twice in a list that is meant to be a set.
  const commit = (next: Row[]) => {
    setRows(next);
    const fieldsRec: Record<string, ManifestField> = {};
    const uk: string[] = [];
    const df: string[] = [];
    for (const r of next) {
      const name = r.name.trim();
      if (!name) continue;
      fieldsRec[name] = trimmedField(r.field);
      if (r.pk && !uk.includes(name)) uk.push(name);
      if (r.default && !df.includes(name)) df.push(name);
    }
    lastCommitted.current = JSON.stringify({ f: fieldsRec, u: uk, d: df });
    setPath([...base, 'fields'], fieldsRec);
    setPath([...base, 'uniqueKeys'], uk.length ? uk : undefined);
    setPath([...base, 'defaultFields'], df.length ? df : undefined);
  };

  const patchField = (id: number, patch: Partial<ManifestField>) => {
    commit(rows.map(r => (r.id === id ? { ...r, field: { ...r.field, ...patch } } : r)));
  };
  // Both of these store EXACTLY what was typed; `commit` trims on the way into the
  // manifest. Trimming here instead made the inputs impossible to type a space into: the
  // field is controlled, so "abc " was written back as "abc" and the value re-rendered
  // without the space on every keystroke — you could never reach a second word. `name`
  // already worked this way (see `r.name.trim()` in commit); these two did not.
  const setDataPath = (id: number, dataPath: string) => {
    commit(rows.map(r => (r.id === id ? { ...r, field: { ...r.field, dataPath } } : r)));
  };
  const setDescription = (id: number, description: string) => {
    commit(rows.map(r => (r.id === id ? { ...r, field: { ...r.field, description } } : r)));
  };
  const toggle = (id: number, key: 'pk' | 'default', checked: boolean) => {
    commit(rows.map(r => (r.id === id ? { ...r, [key]: checked } : r)));
  };
  const setName = (id: number, name: string) => {
    commit(rows.map(r => (r.id === id ? { ...r, name } : r)));
  };
  const removeRow = (id: number) => {
    commit(rows.filter(r => r.id !== id));
  };

  const addRow = () => {
    commit([
      ...rows,
      { id: ++idSeq.current, name: '', field: { type: 'string' }, pk: false, default: false },
    ]);
  };
  const discoverFields = () => {
    if (!hasSample || !state.sample) return;
    const inferred = inferFieldsFromSample(state.sample.records[0]);
    // Existing fields win on name; the manifest write re-seeds the rows.
    setPath([...base, 'fields'], { ...inferred, ...fields });
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

  // Names claimed by more than one row. `commit` keys `fields` by name, so only the last
  // such row reaches the manifest while every one of them stays on screen — the collision is
  // invisible until a reload unless the table says so.
  const trimmedNames = rows.map(r => r.name.trim());
  const duplicateNames = new Set(
    trimmedNames.filter((name, i) => name !== '' && trimmedNames.indexOf(name) !== i)
  );

  const head = (label: string, hint: string, center = false) => (
    <span
      className={`text-muted-foreground flex items-center gap-1.5 text-[11px] ${center ? 'justify-center' : ''}`}
    >
      {label} <FieldInfo hint={hint} />
    </span>
  );

  return (
    <div className='flex flex-col gap-4' data-testid='fields-editor'>
      <div className='flex justify-end gap-2.5'>
        <Button
          type='button'
          variant='outline'
          onClick={discoverFields}
          disabled={!hasSample}
          aria-label='Discover fields from sample'
          className='h-[34px] gap-1.5'
        >
          Discover fields
        </Button>
        <Button
          type='button'
          variant='outline'
          onClick={addRow}
          aria-label='Add field'
          className='h-[34px] gap-1.5'
        >
          <Plus className='h-[15px] w-[15px]' /> Add
        </Button>
      </div>

      <datalist id={listId}>
        {suggestions.map(p => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <div className='bg-card overflow-hidden rounded-md border'>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <Table>
            <TableHeader>
              <TableRow className='bg-muted/50 hover:bg-muted/50'>
                <TableHead className='w-[20px]' />
                <TableHead className='min-w-[140px]'>
                  {head('Field', 'Output column name.')}
                </TableHead>
                <TableHead className='min-w-[150px]'>
                  {head(
                    'Data path',
                    'Dot-path to this value in a record. Empty = same as the field name.'
                  )}
                </TableHead>
                <TableHead className='w-[120px]'>
                  {head('Type', 'Storage type of this column.')}
                </TableHead>
                <TableHead className='w-[84px]'>
                  {head(
                    'Primary key',
                    'Part of the destination primary key (incremental upserts).',
                    true
                  )}
                </TableHead>
                <TableHead className='w-[72px]'>
                  {head(
                    'Default',
                    'Selected by default when this node is added to a data mart.',
                    true
                  )}
                </TableHead>
                <TableHead className='min-w-[160px]'>
                  {head('Description', 'Optional human-friendly description of the column.')}
                </TableHead>
                <TableHead className='w-[44px]' />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow className='hover:bg-transparent'>
                  <TableCell
                    colSpan={8}
                    className='text-muted-foreground py-6 text-center text-[13px]'
                  >
                    No fields yet — add one above{hasSample ? ' or use Discover fields' : ''}.
                  </TableCell>
                </TableRow>
              ) : (
                <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
                  {rows.map(row => (
                    <SortableTableRow key={row.id} id={row.id}>
                      {/* first cell is replaced by the drag handle */}
                      <TableCell />
                      <TableCell
                        className='text-foreground font-medium'
                        data-testid={`field-${row.name}`}
                      >
                        <div className='flex items-center gap-2'>
                          {row.name.trim() === '' && (
                            <CircleAlert
                              className='h-4 w-4 shrink-0 text-red-500'
                              aria-label='Field name is required'
                            />
                          )}
                          {duplicateNames.has(row.name.trim()) && (
                            <span title={DUPLICATE_HINT} className='flex shrink-0'>
                              <CircleAlert
                                className='h-4 w-4 shrink-0 text-red-500'
                                aria-label='Duplicate field name'
                              />
                            </span>
                          )}
                          <EditableText
                            value={row.name}
                            onValueChange={v => {
                              setName(row.id, v);
                            }}
                            placeholder='Field name'
                            isBold
                            className='font-mono'
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          list={listId}
                          value={row.field.dataPath ?? ''}
                          onChange={e => {
                            setDataPath(row.id, e.target.value);
                          }}
                          placeholder={row.name}
                          data-testid={`datapath-${row.name}`}
                          className='h-8 font-mono'
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={row.field.type}
                          onValueChange={v => {
                            patchField(row.id, { type: v });
                          }}
                        >
                          <SelectTrigger className='h-8 w-full'>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FIELD_TYPES.map(t => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className='text-center'>
                        <Checkbox
                          checked={row.pk}
                          onCheckedChange={c => {
                            toggle(row.id, 'pk', c === true);
                          }}
                          aria-label={`Primary key: ${row.name}`}
                          data-testid={`pk-${row.name}`}
                        />
                      </TableCell>
                      <TableCell className='text-center'>
                        <Checkbox
                          checked={row.default}
                          onCheckedChange={c => {
                            toggle(row.id, 'default', c === true);
                          }}
                          aria-label={`Default field: ${row.name}`}
                          data-testid={`default-${row.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.field.description ?? ''}
                          onChange={e => {
                            setDescription(row.id, e.target.value);
                          }}
                          placeholder='Description'
                          data-testid={`fielddesc-${row.name}`}
                          className='h-8'
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
                          aria-label={`Remove field ${row.name}`}
                          className='text-muted-foreground h-8 w-8'
                        >
                          <Trash2 className='h-[15px] w-[15px]' />
                        </Button>
                      </TableCell>
                    </SortableTableRow>
                  ))}
                </SortableContext>
              )}
            </TableBody>
          </Table>
        </DndContext>
      </div>

      {!hasSample && (
        <span className='text-muted-foreground text-xs'>
          Run a test to get data-path suggestions.
        </span>
      )}

      {rows.length > 0 && (
        <span className='text-muted-foreground text-[11px]'>
          <b className='font-medium'>Primary key</b> — field(s) that uniquely identify a row (the
          destination primary key, used for incremental upserts).{' '}
          <b className='font-medium'>Default</b> — fields selected by default when this node is
          added to a data mart.
        </span>
      )}
    </div>
  );
}

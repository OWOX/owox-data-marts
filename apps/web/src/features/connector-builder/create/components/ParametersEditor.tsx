import { Button } from '@owox/ui/components/button';
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
import { asText } from '../../shared/model/asText';
import { SearchInput } from '@owox/ui/components/common/search-input';
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
import { Braces, CircleAlert, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
  CollapsibleCardFooter,
} from '../../../../shared/components/CollapsibleCard';
import { useBuilder } from '../../shared/model/hooks/useBuilder';
import type { ManifestParameter } from '../../shared/model/manifest.types';
import { FieldInfo } from './fields';
import { AccountsEditor } from './AccountsEditor';
import { AdvancedParametersEditor } from './AdvancedParametersEditor';
import { ParameterRowActions } from './ParameterRowActions';
import { AttributesEditor } from './AttributesEditor';

const TYPES: ManifestParameter['requiredType'][] = ['string', 'number', 'boolean', 'date'];

// `ReimportLookbackWindow` and `CreateEmptyTables` are engine-managed parameters: the
// Advanced Parameters card (see AdvancedParametersEditor.tsx) is their EXCLUSIVE editor.
// They must stay out of this table's rows entirely — never seeded, never shown, never
// deletable from here — while still remaining untouched in `manifest.parameters` itself
// whenever this table commits an unrelated change (see `commit` below).
const ADVANCED_MANAGED_PARAMS = new Set(['ReimportLookbackWindow', 'CreateEmptyTables']);

const DUPLICATE_HINT =
  'Another parameter already uses this name — only the last one will be saved. Rename or remove one of them.';

/** One editable row. `id` is a stable client identifier so rows keep focus/order while
 * the name (which is the manifest key) is edited, dragged or left temporarily blank. */
interface Row {
  id: number;
  name: string;
  param: ManifestParameter;
}

const newParam = (): ManifestParameter => ({ requiredType: 'string', isRequired: false });

export function ParametersEditor() {
  const { manifest, setPath } = useBuilder();
  const idSeq = useRef(0);
  // Engine-managed params (ADVANCED_MANAGED_PARAMS) are filtered out here so they never
  // become rows in this table — the re-seed effect below calls this same function, so
  // they stay excluded after the Advanced Parameters card writes them too.
  const seed = (params: Record<string, ManifestParameter>): Row[] =>
    Object.entries(params)
      .filter(([name]) => !ADVANCED_MANAGED_PARAMS.has(name))
      .map(([name, param]) => ({ id: ++idSeq.current, name, param }));

  const [rows, setRows] = useState<Row[]>(() => seed(manifest.parameters));
  const [search, setSearch] = useState('');
  // Tracks the parameters object we last wrote, so we can tell our own writes apart from
  // external ones (Code mode, AI apply, load) and only re-seed on the latter.
  const lastCommitted = useRef(JSON.stringify(manifest.parameters));

  useEffect(() => {
    const incoming = JSON.stringify(manifest.parameters);
    if (incoming !== lastCommitted.current) {
      lastCommitted.current = incoming;
      setRows(seed(manifest.parameters));
    }
  }, [manifest.parameters]);

  // Rebuild the manifest's parameters record from the working rows. Blank names are skipped
  // (a row stays editable until named); on duplicate names the last row wins — which loses
  // the earlier row's configuration, so duplicates are flagged as invalid in the table (see
  // `duplicateNames` below) rather than being merged or renamed behind the author's back.
  // Since ADVANCED_MANAGED_PARAMS never appear in `rows` (seed filters them out), they're
  // carried forward from the current manifest first so an unrelated edit here never wipes
  // whatever the Advanced Parameters card last wrote for them.
  const commit = (next: Row[]) => {
    setRows(next);
    const record: Record<string, ManifestParameter> = {};
    for (const name of ADVANCED_MANAGED_PARAMS) {
      if (name in manifest.parameters) record[name] = manifest.parameters[name];
    }
    for (const r of next) {
      const name = r.name.trim();
      if (name) record[name] = r.param;
    }
    lastCommitted.current = JSON.stringify(record);
    setPath(['parameters'], record);
  };

  const setName = (id: number, name: string) => {
    commit(rows.map(r => (r.id === id ? { ...r, name } : r)));
  };
  const patchParam = (id: number, patch: Partial<ManifestParameter>) => {
    commit(rows.map(r => (r.id === id ? { ...r, param: { ...r.param, ...patch } } : r)));
  };
  // Additive/subtractive on ONE attribute at a time — never overwrites the whole `attributes`
  // array, so co-existing values this editor doesn't render (e.g. SECRET, OAUTH_FLOW, a
  // Code-mode- or AI-authored DEPRECATED) survive untouched.
  const toggleAttribute = (id: number, attr: string, checked: boolean) => {
    const row = rows.find(r => r.id === id);
    if (!row) return;
    const attrs = new Set(row.param.attributes ?? []);
    if (checked) attrs.add(attr);
    else attrs.delete(attr);
    patchParam(id, { attributes: attrs.size ? [...attrs] : undefined });
  };
  const toggleSecret = (id: number, checked: boolean) => {
    toggleAttribute(id, 'SECRET', checked);
  };
  const addRow = () => {
    commit([...rows, { id: ++idSeq.current, name: '', param: newParam() }]);
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

  const q = search.trim().toLowerCase();
  const visible = q
    ? rows.filter(
        r =>
          r.name.toLowerCase().includes(q) ||
          (r.param.label ?? '').toLowerCase().includes(q) ||
          (r.param.description ?? '').toLowerCase().includes(q)
      )
    : rows;
  // Names claimed by more than one row. `commit` keys the manifest by name, so only the last
  // such row survives there while every one of them stays on screen — the collision is
  // invisible until a reload unless the table says so.
  const trimmedNames = rows.map(r => r.name.trim());
  const duplicateNames = new Set(
    trimmedNames.filter((name, i) => name !== '' && trimmedNames.indexOf(name) !== i)
  );
  const invalidCount = rows.filter(r => {
    const name = r.name.trim();
    return name === '' || duplicateNames.has(name);
  }).length;

  // Soft, non-blocking authoring warnings surfaced via the same row affordance as the
  // (hard) blank-name error — these never block save, they just flag likely mistakes.
  const rowWarning = (row: Row): string | null => {
    const attrs = row.param.attributes ?? [];
    const hidden = attrs.includes('HIDE_IN_CONFIG_FORM');
    if (hidden && attrs.includes('PINNED')) {
      return 'Pinned has no effect: this field is also set to Hide in config form.';
    }
    if (hidden && row.param.isRequired && row.param.default == null) {
      return 'Hidden and required with no default value — the setup form can never collect this.';
    }
    return null;
  };

  const headHint = (label: string, hint: string, center = false) => (
    <span
      className={`text-muted-foreground flex items-center gap-1.5 text-[11px] ${center ? 'justify-center' : ''}`}
    >
      {label} <FieldInfo hint={hint} />
    </span>
  );

  return (
    <div className='flex flex-col gap-4 px-6 py-[18px]' data-testid='parameters-editor'>
      <CollapsibleCard collapsible name='connector-parameters'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={Braces}
            tooltip='Reusable tokens you can insert into request URLs, headers, query params and auth, e.g. {{ parameters.VsCurrency }}.'
          >
            Parameters
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          {/* Toolbar — search + invalid count + add */}
          <div className='mb-3 flex items-center justify-between gap-2'>
            <SearchInput
              id='connector-parameters-search'
              placeholder='Search parameters'
              value={search}
              onChange={setSearch}
              className='border-muted dark:border-muted/50 rounded-md border bg-white pl-8 text-sm dark:bg-white/4'
              aria-label='Search parameters'
            />
            <div className='flex items-center gap-3'>
              {invalidCount > 0 && (
                <span className='flex items-center gap-1 text-sm font-medium text-red-500'>
                  <CircleAlert className='h-4 w-4' /> {invalidCount}
                </span>
              )}
              <Button type='button' variant='outline' onClick={addRow} aria-label='Add parameter'>
                <Plus className='h-4 w-4' /> Add Parameter
              </Button>
            </div>
          </div>

          {/* Table — mirrors the Output Schema look & feel */}
          <div className='bg-card overflow-hidden rounded-md border'>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <Table>
                <TableHeader>
                  <TableRow className='bg-muted/50 hover:bg-muted/50'>
                    <TableHead className='w-[20px]' />
                    <TableHead className='w-[36px]' />
                    <TableHead className='min-w-[160px]'>
                      {headHint(
                        'Name',
                        'Token name used in templates, e.g. {{ parameters.Name }}.'
                      )}
                    </TableHead>
                    <TableHead className='w-[130px]'>
                      {headHint('Type', 'Data type of this parameter.')}
                    </TableHead>
                    <TableHead className='w-[80px]'>
                      {headHint('Required', 'Require a value before the connector can run.', true)}
                    </TableHead>
                    <TableHead className='w-[72px]'>
                      {headHint('Secret', 'Mask and encrypt this value at rest.', true)}
                    </TableHead>
                    <TableHead className='min-w-[150px]'>
                      {headHint(
                        'Attributes',
                        'Advanced flags: backfill, hide, pin, advanced grouping.'
                      )}
                    </TableHead>
                    <TableHead className='min-w-[140px]'>
                      {headHint(
                        'Label',
                        'Human-friendly name shown to whoever fills this parameter in.'
                      )}
                    </TableHead>
                    <TableHead className='min-w-[120px]'>
                      {headHint('Default', 'Value used when none is provided at run time.')}
                    </TableHead>
                    <TableHead className='min-w-[160px]'>
                      {headHint(
                        'Description',
                        'Help text shown next to the field when configuring the connector.'
                      )}
                    </TableHead>
                    <TableHead className='w-[44px]' />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.length === 0 ? (
                    <TableRow className='hover:bg-transparent'>
                      <TableCell
                        colSpan={11}
                        className='text-muted-foreground py-6 text-center text-[13px]'
                      >
                        {rows.length === 0
                          ? 'No parameters yet — add one above.'
                          : 'No parameters match your search.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    <SortableContext
                      items={visible.map(r => r.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {visible.map(row => {
                        const blank = row.name.trim() === '';
                        const duplicate = !blank && duplicateNames.has(row.name.trim());
                        const warning = blank ? null : rowWarning(row);
                        return (
                          <SortableTableRow key={row.id} id={row.id}>
                            {/* first cell is replaced by the drag handle */}
                            <TableCell />
                            <TableCell className='text-center' data-testid={`param-${row.name}`}>
                              {blank && (
                                <CircleAlert
                                  className='mx-auto h-4 w-4 text-red-500'
                                  aria-label='Parameter name is required'
                                />
                              )}
                              {duplicate && (
                                <span title={DUPLICATE_HINT}>
                                  <CircleAlert
                                    className='mx-auto h-4 w-4 text-red-500'
                                    aria-label='Duplicate parameter name'
                                  />
                                </span>
                              )}
                              {warning && (
                                <span title={warning}>
                                  <CircleAlert
                                    className='mx-auto h-4 w-4 text-amber-500'
                                    aria-label={warning}
                                  />
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <EditableText
                                value={row.name}
                                onValueChange={v => {
                                  setName(row.id, v);
                                }}
                                placeholder='Parameter name'
                                isBold
                                className='font-mono'
                              />
                            </TableCell>
                            <TableCell>
                              <Select
                                value={row.param.requiredType}
                                onValueChange={v => {
                                  patchParam(row.id, {
                                    requiredType: v as ManifestParameter['requiredType'],
                                  });
                                }}
                              >
                                <SelectTrigger className='h-8 w-full'>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {TYPES.map(t => (
                                    <SelectItem key={t} value={t}>
                                      {t}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className='text-center'>
                              <Checkbox
                                checked={row.param.isRequired}
                                onCheckedChange={c => {
                                  patchParam(row.id, { isRequired: c === true });
                                }}
                                aria-label={`${row.name} required`}
                              />
                            </TableCell>
                            <TableCell className='text-center'>
                              <Checkbox
                                checked={(row.param.attributes ?? []).includes('SECRET')}
                                onCheckedChange={c => {
                                  toggleSecret(row.id, c === true);
                                }}
                                aria-label={`${row.name} secret`}
                              />
                            </TableCell>
                            <TableCell>
                              <AttributesEditor
                                value={row.param.attributes ?? []}
                                onToggle={(attr, checked) => {
                                  toggleAttribute(row.id, attr, checked);
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <EditableText
                                value={row.param.label ?? ''}
                                onValueChange={v => {
                                  patchParam(row.id, { label: v || undefined });
                                }}
                                placeholder='Human-friendly label'
                              />
                            </TableCell>
                            <TableCell>
                              <EditableText
                                value={asText(row.param.default)}
                                onValueChange={v => {
                                  patchParam(row.id, { default: v || undefined });
                                }}
                                placeholder='Default value'
                              />
                            </TableCell>
                            <TableCell>
                              <EditableText
                                value={row.param.description ?? ''}
                                onValueChange={v => {
                                  patchParam(row.id, { description: v || undefined });
                                }}
                                placeholder='Optional description'
                                minRows={3}
                              />
                            </TableCell>
                            <TableCell>
                              <ParameterRowActions
                                name={row.name}
                                onDelete={() => {
                                  removeRow(row.id);
                                }}
                              />
                            </TableCell>
                          </SortableTableRow>
                        );
                      })}
                    </SortableContext>
                  )}
                </TableBody>
              </Table>
            </DndContext>

            {/* Full-width add row at the bottom, mirroring the Output Schema footer */}
            <Button
              type='button'
              variant='ghost'
              onClick={addRow}
              aria-label='Add parameter'
              className='text-muted-foreground h-10 w-full justify-center gap-1.5 rounded-none border-t'
            >
              <Plus className='h-4 w-4' /> Add Parameter
            </Button>
          </div>
        </CollapsibleCardContent>
        <CollapsibleCardFooter />
      </CollapsibleCard>

      <AdvancedParametersEditor />
      <AccountsEditor />
    </div>
  );
}

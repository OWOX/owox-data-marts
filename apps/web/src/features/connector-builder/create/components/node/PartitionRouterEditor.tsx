import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useBuilder } from '../../../shared/model/hooks/useBuilder';
import {
  createDefaultListPartitionRouter,
  createDefaultPartitionRouter,
  type ManifestNodeRequest,
  type PartitionRouter,
} from '../../../shared/model/manifest.types';
import { InfoLabel, OptionSelect } from '../fields';
import { PaginationEditor } from './PaginationEditor';

/** `T` with the keys in `K` admitted as possibly-absent. */
type Loosen<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type SubstreamRouter = Extract<PartitionRouter, { type: 'substream' }>;

/**
 * A partition router as it actually arrives here, before anything has validated it. Code
 * mode is a first-class authoring surface (and the shape an MCP-authored manifest can
 * arrive in), and `parseManifestJson` normalizes only the top level — so a node body
 * reaches this editor verbatim. The engine rejects a `substream` router with no `parent`,
 * no `parent.request` object and no `parent.key`, but it never validates `parent.recordPath`
 * or the parent request's `method`/`path` — and none of that stops a half-finished
 * Code-mode paste from reaching this pane, which has to stay editable long enough for the
 * author to finish it. So read the router through a shape that admits all of it.
 */
type UnvalidatedParent = Loosen<
  Omit<SubstreamRouter['parent'], 'request'>,
  'recordPath' | 'key'
> & {
  request?: Loosen<ManifestNodeRequest, 'method' | 'path'>;
};
type UnvalidatedPartitionRouter =
  | (Omit<SubstreamRouter, 'parent'> & { parent?: UnvalidatedParent })
  | Extract<PartitionRouter, { type: 'list' }>;

export function PartitionRouterEditor({ nodeName }: { nodeName: string }) {
  const { manifest, setPath } = useBuilder();
  const pr: UnvalidatedPartitionRouter | undefined = manifest.nodes[nodeName].partitionRouter;
  const base = ['nodes', nodeName, 'partitionRouter'] as (string | number)[];

  const [newParentKey, setNewParentKey] = useState('');
  const parent = pr?.type === 'substream' ? pr.parent : undefined;
  // Same fallbacks the fields below use: an absent parent reads exactly like the blank one
  // `createDefaultPartitionRouter()` produces — GET, empty path, empty record path, no key.
  const parentQuery = parent?.request?.queryParameters ?? {};
  const rawParentRecordPath = parent?.recordPath;
  const parentRecordPath = Array.isArray(rawParentRecordPath) ? rawParentRecordPath : [];
  const addParentQuery = () => {
    const key = newParentKey.trim();
    if (!key || key in parentQuery) return;
    setPath([...base, 'parent', 'request', 'queryParameters', key], '');
    setNewParentKey('');
  };
  const removeParentQuery = (key: string) => {
    const next = Object.fromEntries(Object.entries(parentQuery).filter(([k]) => k !== key));
    setPath([...base, 'parent', 'request', 'queryParameters'], next);
  };
  const setParentBody = (text: string) => {
    if (text.trim() === '') {
      setPath([...base, 'parent', 'request', 'body'], undefined);
      return;
    }
    try {
      setPath([...base, 'parent', 'request', 'body'], JSON.parse(text) as Record<string, unknown>);
    } catch {
      /* keep last valid */
    }
  };

  return (
    <div className='flex flex-col gap-3' data-testid='partition-router-editor'>
      <label className='flex items-center gap-2 text-[13px]'>
        <input
          type='checkbox'
          checked={!!pr}
          onChange={e => {
            setPath(base, e.target.checked ? createDefaultPartitionRouter() : undefined);
          }}
          aria-label='Enable partitioning'
        />
        Run one request per slice (partition)
      </label>

      {pr && (
        <>
          <label className='flex flex-col'>
            <InfoLabel hint='Substream: slices come from a parent request. List: slices come from a static list or a parameter.'>
              Partition source
            </InfoLabel>
            <OptionSelect
              ariaLabel='Partition source'
              value={pr.type}
              onValueChange={raw => {
                setPath(
                  base,
                  raw === 'list'
                    ? createDefaultListPartitionRouter()
                    : createDefaultPartitionRouter()
                );
              }}
              options={[
                { value: 'substream', label: 'Parent records (substream)' },
                { value: 'list', label: 'Static list' },
              ]}
              className='h-[34px] text-[13px]'
            />
          </label>

          {pr.type === 'substream' && (
            <>
              <div className='grid grid-cols-[120px_1fr] gap-3'>
                <label className='flex flex-col'>
                  <InfoLabel hint='HTTP method for the parent (slice-producing) request.'>
                    Parent method
                  </InfoLabel>
                  <Select
                    value={parent?.request?.method ?? 'GET'}
                    onValueChange={v => {
                      setPath(
                        [...base, 'parent', 'request', 'method'],
                        v as ManifestNodeRequest['method']
                      );
                    }}
                  >
                    <SelectTrigger className='h-[34px] w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='GET'>GET</SelectItem>
                      <SelectItem value='POST'>POST</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className='flex flex-col'>
                  <InfoLabel hint='Path of the parent request that lists the records to iterate.'>
                    Parent path
                  </InfoLabel>
                  <Input
                    value={parent?.request?.path ?? ''}
                    onChange={e => {
                      setPath([...base, 'parent', 'request', 'path'], e.target.value);
                    }}
                    placeholder='/campaigns'
                    className='h-[34px] font-mono'
                  />
                </label>
              </div>
              <label className='flex flex-col'>
                <InfoLabel hint='Dot-path to the array of parent records in the parent response.'>
                  Parent record path
                </InfoLabel>
                <Input
                  value={parentRecordPath.join('.')}
                  onChange={e => {
                    setPath(
                      [...base, 'parent', 'recordPath'],
                      e.target.value
                        .split('.')
                        .map(s => s.trim())
                        .filter(Boolean)
                    );
                  }}
                  placeholder='data'
                  className='h-[34px] font-mono'
                />
              </label>
              <div className='grid grid-cols-2 gap-3'>
                <label className='flex flex-col'>
                  <InfoLabel hint='Field on each parent record used as the slice value.'>
                    Parent key
                  </InfoLabel>
                  <Input
                    value={parent?.key ?? ''}
                    onChange={e => {
                      setPath([...base, 'parent', 'key'], e.target.value);
                    }}
                    placeholder='id'
                    className='h-[34px] font-mono'
                  />
                </label>
                <label className='flex flex-col'>
                  <InfoLabel hint='Name the slice value is exposed under in the child request.'>
                    Partition field
                  </InfoLabel>
                  <Input
                    value={pr.partitionField}
                    onChange={e => {
                      setPath([...base, 'partitionField'], e.target.value);
                    }}
                    placeholder='campaign_id'
                    className='h-[34px] font-mono'
                  />
                </label>
              </div>
              <div className='flex flex-col gap-2'>
                <InfoLabel hint='Query parameters added to the parent (slice-producing) request.'>
                  Parent query parameters
                </InfoLabel>
                {Object.entries(parentQuery).map(([key, value]) => (
                  <div key={key} className='flex items-center gap-2.5'>
                    <span className='text-foreground w-32 truncate font-mono text-[13px]'>
                      {key}
                    </span>
                    <Input
                      value={value}
                      onChange={e => {
                        setPath(
                          [...base, 'parent', 'request', 'queryParameters', key],
                          e.target.value
                        );
                      }}
                      placeholder='{{ parameters.X }}'
                      className='h-[34px] flex-1 font-mono'
                    />
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      onClick={() => {
                        removeParentQuery(key);
                      }}
                      aria-label={`Remove parent query ${key}`}
                      className='text-muted-foreground h-8 w-8'
                    >
                      <Trash2 className='h-[15px] w-[15px]' />
                    </Button>
                  </div>
                ))}
                <div className='flex gap-2.5'>
                  <Input
                    value={newParentKey}
                    onChange={e => {
                      setNewParentKey(e.target.value);
                    }}
                    placeholder='Parent param key'
                    className='h-[34px] flex-1'
                    onKeyDown={e => {
                      if (e.key === 'Enter') addParentQuery();
                    }}
                  />
                  <Button
                    type='button'
                    variant='outline'
                    onClick={addParentQuery}
                    aria-label='Add parent query parameter'
                    className='h-[34px] gap-1.5'
                  >
                    <Plus className='h-[15px] w-[15px]' /> Add
                  </Button>
                </div>
              </div>
              {parent?.request?.method === 'POST' && (
                <ParentBodyEditor initial={parent.request.body} onChange={setParentBody} />
              )}
              <div className='flex flex-col gap-1.5'>
                <InfoLabel hint='How the parent (slice-producing) request walks through multiple pages.'>
                  Parent pagination
                </InfoLabel>
                <PaginationEditor basePath={[...base, 'parent', 'pagination']} />
              </div>
            </>
          )}

          {pr.type === 'list' && (
            <>
              <label className='flex flex-col'>
                <InfoLabel hint='Comma-separated literal values to slice over. Leave empty to use a parameter instead.'>
                  Values
                </InfoLabel>
                <Input
                  value={(pr.values ?? []).join(', ')}
                  onChange={e => {
                    setPath(
                      [...base, 'values'],
                      e.target.value
                        ? e.target.value
                            .split(',')
                            .map(s => s.trim())
                            .filter(Boolean)
                        : undefined
                    );
                  }}
                  placeholder='US, UK, DE'
                  className='h-[34px] font-mono'
                />
              </label>
              <label className='flex flex-col'>
                <InfoLabel hint='Or read a comma-separated parameter at run time. Use this OR Values, not both.'>
                  Values from parameter
                </InfoLabel>
                <Input
                  value={pr.valuesFromParameter ?? ''}
                  onChange={e => {
                    setPath([...base, 'valuesFromParameter'], e.target.value || undefined);
                  }}
                  placeholder='AccountIds'
                  className='h-[34px] font-mono'
                />
              </label>
              <label className='flex flex-col'>
                <InfoLabel hint='Name the slice value is exposed under in the request.'>
                  Partition field
                </InfoLabel>
                <Input
                  value={pr.partitionField}
                  onChange={e => {
                    setPath([...base, 'partitionField'], e.target.value);
                  }}
                  placeholder='country'
                  className='h-[34px] font-mono'
                />
              </label>
            </>
          )}

          <p className='text-muted-foreground text-xs'>
            Reference the slice value in this node's request as{' '}
            <code className='font-mono'>{`{{ stream_slice.${pr.partitionField || 'slice'} }}`}</code>
            .
          </p>
        </>
      )}
    </div>
  );
}

function ParentBodyEditor({
  initial,
  onChange,
}: {
  initial?: Record<string, unknown>;
  onChange: (text: string) => void;
}) {
  const [text, setText] = useState(initial ? JSON.stringify(initial, null, 2) : '');
  const [invalid, setInvalid] = useState(false);
  return (
    <label className='flex flex-col'>
      <InfoLabel hint='JSON body sent with the parent POST request.'>Parent body (JSON)</InfoLabel>
      <textarea
        className='bg-input min-h-24 rounded-lg border p-3 font-mono text-[12.5px] leading-relaxed outline-none'
        value={text}
        onChange={e => {
          const v = e.target.value;
          setText(v);
          if (v.trim() === '') {
            setInvalid(false);
            onChange('');
            return;
          }
          try {
            JSON.parse(v);
            setInvalid(false);
            onChange(v);
          } catch {
            setInvalid(true);
          }
        }}
      />
      {invalid && (
        <span className='mt-1 text-xs text-red-600 dark:text-red-400'>
          Invalid JSON — not saved
        </span>
      )}
    </label>
  );
}

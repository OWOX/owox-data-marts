import { useRef, useState } from 'react';
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
import { useBuilder } from '../../../shared/model/hooks/useBuilder';
import {
  createDefaultResponseFilter,
  type ErrorAction,
  type ErrorBackoff,
  type NodeErrorHandler,
  type ResponseFilter,
} from '../../../shared/model/manifest.types';
import { BackoffEditor } from './BackoffEditor';

const ACTIONS: { value: ErrorAction; label: string }[] = [
  { value: 'RETRY', label: 'Retry' },
  { value: 'IGNORE', label: 'Ignore (empty)' },
  { value: 'FAIL', label: 'Fail' },
];

export function ErrorHandlerEditor({ nodeName }: { nodeName: string }) {
  const { manifest, setPath } = useBuilder();
  const eh: NodeErrorHandler | undefined = manifest.nodes[nodeName].errorHandler;
  const filters: ResponseFilter[] = eh?.responseFilters ?? [];
  // Stable per-row keys so deleting a row does not leave an uncontrolled input
  // (defaultValue) showing a neighbour's stale codes. Keys track add/remove,
  // not array index, and do not change when a row's data is edited.
  const nextKey = useRef(filters.length);
  const [rowKeys, setRowKeys] = useState<number[]>(() => filters.map((_, i) => i));
  const base = ['nodes', nodeName, 'errorHandler'] as (string | number)[];

  const write = (next: NodeErrorHandler) => {
    const empty = next.responseFilters.length === 0 && !next.backoff;
    setPath(base, empty ? undefined : next);
  };
  const current = (): NodeErrorHandler => eh ?? { responseFilters: [] };
  const setFilters = (responseFilters: ResponseFilter[]) => {
    write({ ...current(), responseFilters });
  };
  const addFilter = () => {
    setFilters([...filters, createDefaultResponseFilter()]);
    setRowKeys([...rowKeys, nextKey.current++]);
  };
  const removeFilter = (i: number) => {
    setFilters(filters.filter((_, idx) => idx !== i));
    setRowKeys(rowKeys.filter((_, idx) => idx !== i));
  };
  const setCodes = (i: number, text: string) => {
    setFilters(
      filters.map((f, idx) =>
        idx === i
          ? {
              ...f,
              httpCodes: text
                .split(',')
                .map(s => Number(s.trim()))
                .filter(n => Number.isFinite(n)),
            }
          : f
      )
    );
  };
  const setAction = (i: number, action: ErrorAction) => {
    setFilters(filters.map((f, idx) => (idx === i ? { ...f, action } : f)));
  };
  const setFilterField = (i: number, patch: Partial<ResponseFilter>) => {
    setFilters(filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  };
  const setBodyMatch = (i: number, patch: Partial<NonNullable<ResponseFilter['bodyMatch']>>) => {
    setFilters(
      filters.map((f, idx) => {
        if (idx !== i) return f;
        const bm = { path: [], ...(f.bodyMatch ?? {}), ...patch };
        const clean = bm.path.length === 0 && bm.equals === undefined && bm.contains === undefined;
        return { ...f, bodyMatch: clean ? undefined : bm };
      })
    );
  };

  return (
    <div className='flex flex-col gap-3' data-testid='error-handler-editor'>
      <p className='text-muted-foreground text-xs'>React to HTTP error responses by status code.</p>
      {filters.map((f, i) => (
        <div
          key={rowKeys[i] ?? i}
          className='flex flex-col gap-1.5'
          data-testid={`error-filter-${i}`}
        >
          <div className='flex items-center gap-2.5'>
            <Input
              defaultValue={(f.httpCodes ?? []).join(', ')}
              onChange={e => {
                setCodes(i, e.target.value);
              }}
              placeholder='429, 503'
              className='h-[34px] flex-1 font-mono'
            />
            <Select
              value={f.action}
              onValueChange={v => {
                setAction(i, v as ErrorAction);
              }}
            >
              <SelectTrigger className='h-[34px] w-40'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIONS.map(a => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              onClick={() => {
                removeFilter(i);
              }}
              aria-label={`Remove filter ${i + 1}`}
              className='text-muted-foreground h-8 w-8'
            >
              <Trash2 className='h-[15px] w-[15px]' />
            </Button>
          </div>
          <div className='flex flex-wrap items-center gap-2 pl-1'>
            <Input
              defaultValue={f.messageContains ?? ''}
              onChange={e => {
                setFilterField(i, { messageContains: e.target.value || undefined });
              }}
              placeholder='message contains'
              className='h-[34px] flex-1 font-mono'
            />
            <Input
              defaultValue={(f.bodyMatch?.path ?? []).join('.')}
              onChange={e => {
                setBodyMatch(i, { path: e.target.value ? e.target.value.split('.') : [] });
              }}
              placeholder='body path e.g. error.type'
              className='h-[34px] w-44 font-mono'
            />
            <Input
              defaultValue={f.bodyMatch?.equals ?? ''}
              onChange={e => {
                setBodyMatch(i, { equals: e.target.value || undefined });
              }}
              placeholder='equals'
              className='h-[34px] w-28 font-mono'
            />
            <Input
              defaultValue={f.bodyMatch?.contains ?? ''}
              onChange={e => {
                setBodyMatch(i, { contains: e.target.value || undefined });
              }}
              placeholder='contains'
              className='h-[34px] w-28 font-mono'
            />
            <BackoffEditor
              value={f.backoff}
              label={`Filter ${i + 1} backoff`}
              onChange={(b: ErrorBackoff | undefined) => {
                setFilterField(i, { backoff: b });
              }}
            />
          </div>
        </div>
      ))}
      <Button
        type='button'
        variant='outline'
        onClick={addFilter}
        aria-label='Add filter'
        className='h-[34px] w-fit gap-1.5'
      >
        <Plus className='h-[15px] w-[15px]' /> Add filter
      </Button>
      <div className='mt-1 flex items-center gap-2 text-[13px]'>
        <span className='text-muted-foreground'>Default backoff</span>
        <BackoffEditor
          value={eh?.backoff}
          label='Default backoff'
          onChange={b => {
            write({ ...current(), backoff: b });
          }}
        />
      </div>
    </div>
  );
}

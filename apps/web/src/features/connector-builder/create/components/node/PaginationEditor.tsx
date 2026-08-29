import { useRef } from 'react';
import { Input } from '@owox/ui/components/input';
import { useBuilder } from '../../../shared/model/hooks/useBuilder';
import {
  createDefaultPagination,
  type ManifestNodePagination,
} from '../../../shared/model/manifest.types';
import { getAtPath, toDotPath } from '../../../shared/model/manifestPath';
import { InfoLabel, OptionSelect, Segmented } from '../fields';

type PgChoice = ManifestNodePagination['type'];
const CHOICES: { key: PgChoice; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'offset', label: 'Offset' },
  { key: 'page', label: 'Page' },
  { key: 'cursor', label: 'Cursor' },
];

type InjectInto = 'query' | 'header' | 'body' | 'path';
const INJECT_TARGETS: { value: InjectInto; label: string }[] = [
  { value: 'query', label: 'query' },
  { value: 'header', label: 'header' },
  { value: 'body', label: 'body' },
  { value: 'path', label: 'path' },
];
const CURSOR_SOURCES = [
  { value: 'body', label: 'body' },
  { value: 'header', label: 'header' },
];

export function PaginationEditor({ basePath }: { basePath: (string | number)[] }) {
  const { manifest, setPath } = useBuilder();
  const pagination = getAtPath(manifest, basePath) as ManifestNodePagination | undefined;
  const current: PgChoice = pagination?.type ?? 'none';
  const base = basePath;
  const stopPathInputRef = useRef<HTMLInputElement>(null);

  const choose = (type: PgChoice) => {
    if (type === 'none') setPath(base, undefined);
    else setPath(base, createDefaultPagination(type));
  };

  /** Shared by all three pagination types: they inject their cursor/offset/page the same way.
   * `name` and `path` are carried over so switching target does not silently lose them, but
   * only the one the new target actually reads is kept. */
  const setInjectInto = (raw: string | undefined) => {
    if (!raw) {
      setPath([...base, 'inject'], undefined);
      return;
    }
    // Hoisting this out of the three branches costs the narrowing they had: the union's
    // `none` member carries no `inject` at all, so ask before reading.
    const inject = pagination && 'inject' in pagination ? pagination.inject : undefined;
    const into = raw as InjectInto;
    const next: { into: InjectInto; name?: string; path?: string[] } = { into };
    if (into === 'query' || into === 'header') next.name = inject?.name;
    else if (into === 'body') next.path = inject?.path;
    setPath([...base, 'inject'], next);
  };

  return (
    <div className='flex flex-col gap-4' data-testid='pagination-editor'>
      <div>
        <InfoLabel hint='How the connector walks through multiple pages of results.'>
          Pagination type
        </InfoLabel>
        <Segmented
          options={CHOICES}
          value={current}
          onChange={choose}
          ariaLabel='Pagination type'
        />
      </div>

      {pagination?.type === 'offset' && (
        <>
          <div className='grid grid-cols-2 gap-3.5'>
            <label className='flex flex-col'>
              <InfoLabel hint='Query parameter that sets the row offset (used when no inject target is chosen).'>
                Offset parameter
              </InfoLabel>
              <Input
                value={pagination.offsetParam ?? ''}
                onChange={e => {
                  setPath([...base, 'offsetParam'], e.target.value);
                }}
                placeholder='offset'
              />
            </label>
            <label className='flex flex-col'>
              <InfoLabel hint='How many rows to request per page.'>Page size</InfoLabel>
              <Input
                type='number'
                value={pagination.pageSize ?? ''}
                onChange={e => {
                  setPath([...base, 'pageSize'], Number(e.target.value));
                }}
              />
            </label>
          </div>
          <div className='grid grid-cols-2 gap-3.5'>
            <label className='flex flex-col gap-1'>
              <InfoLabel hint='Where to inject the offset value. Default uses the query parameter above.'>
                Inject target
              </InfoLabel>
              <OptionSelect
                ariaLabel='Offset inject target'
                value={pagination.inject?.into}
                onValueChange={setInjectInto}
                options={INJECT_TARGETS}
                unsetLabel='— default (query param) —'
                className='h-9'
              />
            </label>
            {(pagination.inject?.into === 'query' || pagination.inject?.into === 'header') && (
              <label className='flex flex-col gap-1'>
                <InfoLabel hint='Parameter or header name to inject the offset into.'>
                  Inject name
                </InfoLabel>
                <Input
                  aria-label='Offset inject name'
                  value={pagination.inject.name ?? ''}
                  onChange={e => {
                    setPath([...base, 'inject', 'name'], e.target.value);
                  }}
                  placeholder='X-Offset'
                />
              </label>
            )}
          </div>
          {pagination.inject?.into === 'body' && (
            <label className='flex flex-col gap-1'>
              <InfoLabel hint='Dot-path in the request body where the offset is injected.'>
                Inject body path
              </InfoLabel>
              <Input
                aria-label='Offset inject body path'
                defaultValue={pagination.inject.path?.join('.') ?? ''}
                onChange={e => {
                  setPath([...base, 'inject', 'path'], toDotPath(e.target.value));
                }}
                placeholder='variables.offset'
                className='font-mono'
              />
            </label>
          )}
        </>
      )}

      {pagination?.type === 'page' && (
        <>
          <div className='grid grid-cols-2 gap-3.5'>
            <label className='flex flex-col'>
              <InfoLabel hint='Query parameter that sets the page number (used when no inject target is chosen).'>
                Page parameter
              </InfoLabel>
              <Input
                value={pagination.pageParam ?? ''}
                onChange={e => {
                  setPath([...base, 'pageParam'], e.target.value);
                }}
                placeholder='page'
              />
            </label>
            <label className='flex flex-col'>
              <InfoLabel hint='Page number the API starts counting from.'>Start page</InfoLabel>
              <Input
                type='number'
                value={pagination.startPage ?? 1}
                onChange={e => {
                  setPath([...base, 'startPage'], Number(e.target.value));
                }}
              />
            </label>
          </div>
          <div className='grid grid-cols-2 gap-3.5'>
            <label className='flex flex-col gap-1'>
              <InfoLabel hint='Where to inject the page number. Default uses the query parameter above.'>
                Inject target
              </InfoLabel>
              <OptionSelect
                ariaLabel='Page inject target'
                value={pagination.inject?.into}
                onValueChange={setInjectInto}
                options={INJECT_TARGETS}
                unsetLabel='— default (query param) —'
                className='h-9'
              />
            </label>
            {(pagination.inject?.into === 'query' || pagination.inject?.into === 'header') && (
              <label className='flex flex-col gap-1'>
                <InfoLabel hint='Parameter or header name to inject the page number into.'>
                  Inject name
                </InfoLabel>
                <Input
                  aria-label='Page inject name'
                  value={pagination.inject.name ?? ''}
                  onChange={e => {
                    setPath([...base, 'inject', 'name'], e.target.value);
                  }}
                  placeholder='X-Page'
                />
              </label>
            )}
          </div>
          {pagination.inject?.into === 'body' && (
            <label className='flex flex-col gap-1'>
              <InfoLabel hint='Dot-path in the request body where the page number is injected.'>
                Inject body path
              </InfoLabel>
              <Input
                aria-label='Page inject body path'
                defaultValue={pagination.inject.path?.join('.') ?? ''}
                onChange={e => {
                  setPath([...base, 'inject', 'path'], toDotPath(e.target.value));
                }}
                placeholder='variables.page'
                className='font-mono'
              />
            </label>
          )}
        </>
      )}

      {pagination?.type === 'cursor' && (
        <>
          <div className='grid grid-cols-2 gap-3.5'>
            <label className='flex flex-col'>
              <InfoLabel hint='JSON path to the next-page cursor in the response.'>
                Cursor path
              </InfoLabel>
              <Input
                defaultValue={pagination.cursorPath?.join('.') ?? ''}
                onChange={e => {
                  setPath([...base, 'cursorPath'], toDotPath(e.target.value));
                }}
                placeholder='paging.next'
                className='font-mono'
              />
            </label>
            <label className='flex flex-col'>
              <InfoLabel hint='Query parameter that carries the cursor.'>
                Cursor parameter
              </InfoLabel>
              <Input
                value={pagination.cursorParam ?? ''}
                onChange={e => {
                  setPath([...base, 'cursorParam'], e.target.value);
                }}
                placeholder='after'
              />
            </label>
          </div>

          <div className='grid grid-cols-2 gap-3.5'>
            <label className='flex flex-col gap-1'>
              <InfoLabel hint='Where to read the next cursor value from in the response.'>
                Cursor source
              </InfoLabel>
              <OptionSelect
                ariaLabel='Cursor source'
                value={pagination.cursor?.from}
                onValueChange={raw => {
                  if (!raw) {
                    setPath([...base, 'cursor'], undefined);
                    return;
                  }
                  setPath([...base, 'cursor'], {
                    from: raw as 'body' | 'header',
                    path: pagination.cursor?.path ?? [],
                    header: pagination.cursor?.header,
                  });
                }}
                options={CURSOR_SOURCES}
                unsetLabel='— none —'
                className='h-9'
              />
            </label>

            <label className='flex flex-col gap-1'>
              <InfoLabel hint='Where to inject the cursor value into the next request.'>
                Cursor inject target
              </InfoLabel>
              <OptionSelect
                ariaLabel='Cursor inject target'
                value={pagination.inject?.into}
                onValueChange={setInjectInto}
                options={INJECT_TARGETS}
                unsetLabel='— none —'
                className='h-9'
              />
            </label>
          </div>

          {pagination.cursor?.from === 'body' && (
            <label className='flex flex-col gap-1'>
              <InfoLabel hint='Dot-separated JSON path to the cursor value in the response body.'>
                Cursor body path
              </InfoLabel>
              <Input
                defaultValue={pagination.cursor.path?.join('.') ?? ''}
                onChange={e => {
                  setPath([...base, 'cursor', 'path'], toDotPath(e.target.value));
                }}
                placeholder='data.pageInfo.endCursor'
                className='font-mono'
              />
            </label>
          )}

          {pagination.cursor?.from === 'header' && (
            <div className='grid grid-cols-2 gap-3.5'>
              <label className='flex flex-col gap-1'>
                <InfoLabel hint='Name of the response header containing the cursor.'>
                  Header name
                </InfoLabel>
                <Input
                  value={pagination.cursor.header ?? ''}
                  onChange={e => {
                    setPath([...base, 'cursor', 'header'], e.target.value);
                  }}
                  placeholder='Link'
                />
              </label>
              <label className='flex flex-col gap-1'>
                <InfoLabel hint='Link rel value to extract (e.g. "next").'>Link rel</InfoLabel>
                <Input
                  value={pagination.cursor.linkRel ?? ''}
                  onChange={e => {
                    setPath([...base, 'cursor', 'linkRel'], e.target.value || undefined);
                  }}
                  placeholder='next'
                />
              </label>
            </div>
          )}

          {(pagination.inject?.into === 'query' || pagination.inject?.into === 'header') && (
            <label className='flex flex-col gap-1'>
              <InfoLabel hint='Parameter or header name to inject the cursor into.'>
                Inject name
              </InfoLabel>
              <Input
                value={pagination.inject.name ?? ''}
                onChange={e => {
                  setPath([...base, 'inject', 'name'], e.target.value);
                }}
                placeholder='after'
              />
            </label>
          )}

          {pagination.inject?.into === 'body' && (
            <label className='flex flex-col gap-1'>
              <InfoLabel hint='Dot-separated JSON path in the request body where the cursor is injected.'>
                Inject body path
              </InfoLabel>
              <Input
                defaultValue={pagination.inject.path?.join('.') ?? ''}
                onChange={e => {
                  setPath([...base, 'inject', 'path'], toDotPath(e.target.value));
                }}
                placeholder='variables.after'
                className='font-mono'
              />
            </label>
          )}

          {pagination.inject?.into === 'path' && (
            <p className='text-muted-foreground text-xs'>
              The cursor value becomes the next request path/URL.
            </p>
          )}

          <div className='grid grid-cols-2 gap-3.5'>
            <label className='flex flex-col gap-1'>
              <InfoLabel hint='Dot-separated JSON path to the field to check for the stop condition.'>
                Stop condition path
              </InfoLabel>
              <Input
                ref={stopPathInputRef}
                defaultValue={pagination.stopCondition?.path?.join('.') ?? ''}
                onChange={e => {
                  const pathParts = toDotPath(e.target.value);
                  const rawEquals =
                    pagination.stopCondition?.equals !== undefined
                      ? String(pagination.stopCondition.equals)
                      : '';
                  const equals =
                    rawEquals === 'true' ? true : rawEquals === 'false' ? false : rawEquals;
                  if (pathParts.length && rawEquals !== '') {
                    setPath([...base, 'stopCondition'], { path: pathParts, equals });
                  } else {
                    setPath([...base, 'stopCondition'], undefined);
                  }
                }}
                placeholder='pageInfo.hasNextPage'
                className='font-mono'
              />
            </label>
            <label className='flex flex-col gap-1'>
              <InfoLabel hint='Value that signals the last page (true/false or a string).'>
                Stop condition equals
              </InfoLabel>
              <Input
                value={
                  pagination.stopCondition?.equals !== undefined
                    ? String(pagination.stopCondition.equals)
                    : ''
                }
                onChange={e => {
                  const rawEquals = e.target.value;
                  const domPath = stopPathInputRef.current?.value ?? '';
                  const pathParts = toDotPath(domPath);
                  const equals =
                    rawEquals === 'true' ? true : rawEquals === 'false' ? false : rawEquals;
                  if (pathParts.length && rawEquals !== '') {
                    setPath([...base, 'stopCondition'], { path: pathParts, equals });
                  } else {
                    setPath([...base, 'stopCondition'], undefined);
                  }
                }}
                placeholder='false'
              />
            </label>
          </div>
        </>
      )}
    </div>
  );
}

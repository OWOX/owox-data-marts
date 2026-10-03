import { Input } from '@owox/ui/components/input';
import { useBuilder } from '../../../shared/model/hooks/useBuilder';
import { type RecordFilter, type RecordFilterOperator } from '../../../shared/model/manifest.types';
import { toDotPath } from '../../../shared/model/manifestPath';
import { OptionSelect } from '../fields';

const OPERATORS: RecordFilterOperator[] = [
  'equals',
  'notEquals',
  'contains',
  'isNotNull',
  'isNull',
  'inList',
];
const NEEDS_VALUE = new Set<RecordFilterOperator>(['equals', 'notEquals', 'contains']);

/** `T` with the keys in `K` admitted as possibly-absent. */
type Loosen<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * A record filter as it actually arrives here, before anything has validated it. Code mode
 * is a first-class authoring surface (and the shape an MCP-authored manifest can arrive in),
 * and `parseManifestJson` normalizes only the top level — so a node body reaches this editor
 * verbatim. The engine does reject a `recordFilter` without a non-empty string `path`, so
 * this shape never runs; it is still what a half-finished Code-mode paste looks like, and the
 * pane has to stay editable long enough for the author to finish it. `RecordFilter` declares
 * `path` as required, so read it through a shape that admits its absence.
 */
type UnvalidatedRecordFilter = Loosen<RecordFilter, 'path'>;

export function RecordFilterEditor({ nodeName }: { nodeName: string }) {
  const { manifest, setPath } = useBuilder();
  const rf: UnvalidatedRecordFilter | undefined = manifest.nodes[nodeName].recordFilter;
  const rawPath = rf?.path;
  // Same tolerance as the record path: anything that is not an array of segments is empty.
  const filterPath = Array.isArray(rawPath) ? rawPath : [];
  const base = ['nodes', nodeName, 'recordFilter'] as (string | number)[];

  return (
    <div className='flex flex-col gap-3' data-testid='record-filter-editor'>
      <label className='flex items-center gap-2 text-[13px]'>
        <input
          type='checkbox'
          checked={!!rf}
          onChange={e => {
            setPath(base, e.target.checked ? { path: [], operator: 'isNotNull' } : undefined);
          }}
          aria-label='Enable record filter'
        />
        Keep only records matching a condition
      </label>
      {rf && (
        <>
          <label className='flex flex-col'>
            <span className='text-[13px]'>Field path</span>
            {/* UNCONTROLLED on purpose: a controlled dot-path input round-trips through
                  split/join on every keystroke, so typing the dot in `a.b` drops the empty
                  trailing segment and deletes the dot as it is typed -- a nested path could
                  not be entered at all. Every other dot-path field here is uncontrolled. */}
            <Input
              defaultValue={filterPath.join('.')}
              onChange={e => {
                setPath([...base, 'path'], toDotPath(e.target.value));
              }}
              placeholder='sheetType'
              className='h-[34px] font-mono'
            />
          </label>
          <label className='flex flex-col'>
            <span className='text-[13px]'>Operator</span>
            <OptionSelect
              ariaLabel='Filter operator'
              value={rf.operator}
              onValueChange={raw => {
                const operator = raw as RecordFilterOperator;
                const next: RecordFilter = { path: filterPath, operator };
                if (
                  (operator === 'equals' ||
                    operator === 'notEquals' ||
                    operator === 'contains' ||
                    operator === 'inList') &&
                  rf.value !== undefined
                ) {
                  next.value = rf.value;
                }
                if (operator === 'inList' && rf.valuesFromParameter !== undefined) {
                  next.valuesFromParameter = rf.valuesFromParameter;
                }
                setPath(base, next);
              }}
              options={OPERATORS.map(op => ({ value: op, label: op }))}
              className='h-[34px] text-[13px]'
            />
          </label>
          {NEEDS_VALUE.has(rf.operator) && (
            <label className='flex flex-col'>
              <span className='text-[13px]'>Value</span>
              <Input
                value={rf.value ?? ''}
                onChange={e => {
                  setPath([...base, 'value'], e.target.value || undefined);
                }}
                placeholder='GRID'
                className='h-[34px] font-mono'
              />
            </label>
          )}
          {rf.operator === 'inList' && (
            <>
              <label className='flex flex-col'>
                <span className='text-[13px]'>Values (comma-separated)</span>
                <Input
                  value={rf.value ?? ''}
                  onChange={e => {
                    setPath([...base, 'value'], e.target.value || undefined);
                  }}
                  placeholder='1, 2, 3'
                  className='h-[34px] font-mono'
                />
              </label>
              <label className='flex flex-col'>
                <span className='text-[13px]'>Or values from parameter</span>
                <Input
                  value={rf.valuesFromParameter ?? ''}
                  onChange={e => {
                    setPath([...base, 'valuesFromParameter'], e.target.value || undefined);
                  }}
                  placeholder='SurveyIds'
                  className='h-[34px] font-mono'
                />
              </label>
            </>
          )}
        </>
      )}
    </div>
  );
}

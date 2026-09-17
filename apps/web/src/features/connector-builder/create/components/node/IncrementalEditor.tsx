import { Input } from '@owox/ui/components/input';
import { useBuilder } from '../../../shared/model/hooks/useBuilder';
import {
  createDefaultIncremental,
  type IncrementalRequest,
  type ManifestNodeIncremental,
} from '../../../shared/model/manifest.types';
import { toDotPath } from '../../../shared/model/manifestPath';
import { InfoLabel, Segmented } from '../fields';

type IncChoice = ManifestNodeIncremental['strategy'];
const CHOICES: { key: IncChoice; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'day-by-day', label: 'Day-by-day' },
  { key: 'range', label: 'Range' },
];
const INTO_CHOICES: { key: 'query' | 'body'; label: string }[] = [
  { key: 'query', label: 'query' },
  { key: 'body', label: 'body' },
];

export function IncrementalEditor({ nodeName }: { nodeName: string }) {
  const { manifest, setPath } = useBuilder();
  const incremental = manifest.nodes[nodeName].incremental;
  const current: IncChoice = incremental?.strategy ?? 'none';
  const base = ['nodes', nodeName, 'incremental'] as (string | number)[];
  const isRange = current === 'range';
  const req: IncrementalRequest | undefined =
    incremental && incremental.strategy !== 'none' ? incremental.request : undefined;

  const choose = (strategy: IncChoice) => {
    if (strategy === 'none') {
      setPath(base, undefined);
      return;
    }
    if (!incremental || incremental.strategy === 'none') {
      // Nothing to carry over yet — seed the conventional default shape.
      setPath(base, createDefaultIncremental(strategy));
      return;
    }
    // Moving between day-by-day and range: keep the author's request as-is, only flip the
    // strategy. Rebuilding via createDefaultIncremental here would wipe any custom
    // startName/endName the user already typed.
    let nextRequest = incremental.request;
    if (strategy === 'range') {
      // Range needs an end bound to be usable; seed the conventional default only if the
      // request doesn't already have one (don't clobber a value the user set).
      if (nextRequest.into === 'query' && !nextRequest.endName) {
        nextRequest = { ...nextRequest, endName: 'end_date' };
      } else if (nextRequest.into === 'body' && !nextRequest.endPath) {
        nextRequest = { ...nextRequest, endPath: ['date', 'end'] };
      }
    }
    // This is the one place that replaces the whole `incremental` object rather than a leaf,
    // so spread what's already there: keys this editor doesn't render — a legacy
    // `cursorField`, anything a Code-mode or MCP author added — survive the switch instead
    // of being dropped on the author's behalf.
    setPath(base, { ...incremental, strategy, request: nextRequest });
  };

  const setInto = (into: 'query' | 'body') => {
    const format = req?.format ?? 'YYYY-MM-DD';
    // An end bound is available for any strategy now (day-by-day APIs can need
    // ?start=D&end=D too, not just range) — so an existing endName/endPath always
    // survives a toggle. Only seed the conventional default when there wasn't one
    // already and the strategy is range; day-by-day stays without one until the
    // user opts in, per createDefaultIncremental's day-by-day default.
    const endName = req?.endName ?? (isRange ? 'end_date' : undefined);
    const endPath = req?.endPath ?? (isRange ? ['date', 'end'] : undefined);
    const next: IncrementalRequest =
      into === 'query'
        ? {
            ...req,
            into,
            startName: req?.startName ?? 'start_date',
            format,
            ...(endName ? { endName } : {}),
          }
        : {
            ...req,
            into,
            startPath: req?.startPath ?? ['date', 'start'],
            format,
            ...(endPath ? { endPath } : {}),
          };
    setPath([...base, 'request'], next);
  };

  return (
    <div className='flex flex-col gap-4' data-testid='incremental-editor'>
      <div>
        <InfoLabel hint='How the connector fetches only new data over time.'>
          Incremental strategy
        </InfoLabel>
        <Segmented
          options={CHOICES}
          value={current}
          onChange={choose}
          ariaLabel='Incremental strategy'
        />
      </div>

      {current !== 'none' && req && (
        <>
          <div>
            <InfoLabel hint='Where the date bounds are placed on the request.'>
              Inject into
            </InfoLabel>
            <Segmented
              options={INTO_CHOICES}
              value={req.into}
              onChange={setInto}
              ariaLabel='Inject into'
            />
          </div>

          {req.into === 'query' ? (
            <div key='inc-query' className='grid grid-cols-2 gap-3.5'>
              <label className='flex flex-col'>
                <InfoLabel hint='Query parameter for the start date.'>Start parameter</InfoLabel>
                <Input
                  value={req.startName ?? ''}
                  onChange={e => {
                    setPath([...base, 'request', 'startName'], e.target.value);
                  }}
                  placeholder='start_date'
                />
              </label>
              <label className='flex flex-col'>
                <InfoLabel hint='Query parameter for the end date.'>End parameter</InfoLabel>
                <Input
                  value={req.endName ?? ''}
                  onChange={e => {
                    setPath([...base, 'request', 'endName'], e.target.value);
                  }}
                  placeholder='end_date'
                />
              </label>
            </div>
          ) : (
            <div key='inc-body' className='grid grid-cols-2 gap-3.5'>
              <label className='flex flex-col'>
                <InfoLabel hint='JSON path for the start date in the body.'>Start path</InfoLabel>
                <Input
                  defaultValue={(req.startPath ?? []).join('.')}
                  onChange={e => {
                    setPath([...base, 'request', 'startPath'], toDotPath(e.target.value));
                  }}
                  placeholder='date.start'
                  className='font-mono'
                />
              </label>
              <label className='flex flex-col'>
                <InfoLabel hint='JSON path for the end date in the body.'>End path</InfoLabel>
                <Input
                  defaultValue={(req.endPath ?? []).join('.')}
                  onChange={e => {
                    setPath([...base, 'request', 'endPath'], toDotPath(e.target.value));
                  }}
                  placeholder='date.end'
                  className='font-mono'
                />
              </label>
            </div>
          )}

          <label className='flex flex-col'>
            <InfoLabel hint='Date format the API expects (e.g. YYYY-MM-DD).'>Date format</InfoLabel>
            <Input
              value={req.format ?? ''}
              onChange={e => {
                setPath([...base, 'request', 'format'], e.target.value);
              }}
              placeholder='YYYY-MM-DD'
            />
          </label>

          <p className='text-muted-foreground text-xs'>
            Time-series (destination partitioning) is set separately in the Fields tab.
          </p>
        </>
      )}
    </div>
  );
}

import { Fragment, useEffect, useMemo, useState } from 'react';
import { CirclePlay, Play, Settings, ChevronDown } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { cn } from '@owox/ui/lib/utils';
import { useBuilder } from '../../shared/model/hooks/useBuilder';
import { asText } from '../../shared/model/asText';
import { ConnectorBuilderApiService } from '../../shared/api/connector-builder-api.service';
import { apiErrorMessage } from '../../../../app/api/extract-api-error.util';
import { TestSettingsPanel } from './TestSettingsPanel';
import type { ConnectorTestResultDto } from '../../shared/api/types';

/** Which representation of the test run the dock body shows. */
type ResultView = 'table' | 'json' | 'logs';

/**
 * The sentence to show in the dock when the test request itself failed.
 *
 * A refusal the backend wrote for a human — the connector-test concurrency limit is the
 * one that a user hits by simply pressing Run twice — arrives as an AxiosError whose own
 * `message` is only "Request failed with status code 400". Rendering that turns an
 * explanation ("this project already has 3 connector tests running") into an opaque
 * failure, and the "Fix with AI" flow is fed the same string. Read the body first, the
 * same way the shared toast does.
 */
export function testFailureMessage(error: unknown): string {
  return apiErrorMessage(error, 'Test failed');
}

/** The records the dock should render: the cast rows when present, otherwise the raw
 * sample — so a node with no declared fields still shows output for field discovery.
 * Typed nullable because a raw sample is the source's own JSON: `[{...}, null]` is a
 * shape a real API returns, and the DTO's non-null row type is a promise nothing keeps. */
export function displayRecords(result: ConnectorTestResultDto): (Record<string, unknown> | null)[] {
  return result.rows.length ? result.rows : (result.sample ?? []);
}

/** Column model for a record set. Objects → the union of their top-level keys (raw
 * records may differ record-to-record). Primitives (e.g. a recordPath yielding an array
 * of scalars) → a single "value" column, one element per row. */
export function deriveColumns(records: (Record<string, unknown> | null)[]): {
  columns: string[];
  primitive: boolean;
} {
  // The records come straight from a connector's JSON response, so a null entry
  // is possible even though the row type does not spell it out.
  const primitive = records.every(r => r === null || typeof r !== 'object');
  if (primitive) return { columns: ['value'], primitive: true };
  const columns = Array.from(new Set(records.flatMap(r => Object.keys(r ?? {}))));
  return { columns, primitive: false };
}

/**
 * Full-width, collapsible "Test results" dock pinned to the bottom of the work area
 * (the centerpiece of the Dense Pro redesign). The test inputs that used to live in
 * the old vertical Testing panel — node, parameter values, max rows — now live in a
 * gear popover anchored to the dock header; the results render as a wide grid below.
 */
export function ResultsDock({
  selectedNode,
  open,
  onToggleOpen,
  onFixWithAi,
}: {
  selectedNode?: string;
  open: boolean;
  onToggleOpen: () => void;
  onFixWithAi?: (ctx: { logs: string[]; error: string }) => void;
}) {
  const { manifest, setSample, state } = useBuilder();
  const nodeNames = Object.keys(manifest.nodes);
  const paramEntries = Object.entries(manifest.parameters);

  const [node, setNode] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [maxRows, setMaxRows] = useState(25);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ConnectorTestResultDto | null>(null);
  const [settings, setSettings] = useState(false);
  const [view, setView] = useState<ResultView>('table');
  const [dockHeight, setDockHeight] = useState(300);

  // Which parameters the manifest declares SECRET. Their test values are credentials the
  // author typed to reach a live API, so they are kept in memory for the session and never
  // written to disk — the same distinction the Data Mart configuration form makes.
  const secretNames = useMemo(
    () =>
      new Set(
        Object.entries(manifest.parameters)
          .filter(([, param]) => (param.attributes ?? []).includes('SECRET'))
          .map(([name]) => name)
      ),
    [manifest.parameters]
  );

  // Test inputs persist per connector on this device, so they survive runs and reloads.
  // Only once the connector has an id: before that there is nothing to key them to, and a
  // shared "new" bucket handed one draft's values to the next one. An unsaved draft has
  // nothing to restore them onto either — reloading /connectors/builder/new starts empty.
  const storageKey = state.id ? `connector-builder:test-settings:${state.id}` : null;
  const withoutSecrets = (values: Record<string, string>) =>
    Object.fromEntries(Object.entries(values).filter(([name]) => !secretNames.has(name)));
  const persist = (nextValues: Record<string, string>, nextMaxRows: number) => {
    if (!storageKey) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ values: withoutSecrets(nextValues), maxRows: nextMaxRows })
      );
    } catch {
      /* ignore storage quota / availability errors */
    }
  };
  const updateValue = (name: string, value: string) => {
    setValues(prev => {
      const next = { ...prev, [name]: value };
      persist(next, maxRows);
      return next;
    });
  };
  const updateMaxRows = (next: number) => {
    setMaxRows(next);
    persist(values, next);
  };

  // Drag the top edge to resize the dock body. Dragging it below COLLAPSE_PX
  // collapses the dock (it then shows only the header; reopen via the chevron).
  const COLLAPSE_PX = 25;
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    // From a collapsed dock the body height is effectively 0, so dragging up grows it.
    const startH = open ? dockHeight : 0;
    const maxH = Math.max(120, Math.round(window.innerHeight * 0.8));
    let liveOpen = open;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
    const setOpen = (next: boolean) => {
      if (liveOpen !== next) {
        liveOpen = next;
        onToggleOpen();
      }
    };
    const cleanup = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', cleanup);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    const onMove = (ev: MouseEvent) => {
      const candidate = startH + (startY - ev.clientY);
      if (candidate < COLLAPSE_PX) {
        // Collapse, but keep the drag alive so dragging back up re-expands.
        setOpen(false);
        setDockHeight(300);
      } else {
        setOpen(true);
        setDockHeight(Math.min(candidate, maxH));
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', cleanup);
  };

  useEffect(() => {
    if (selectedNode && selectedNode in manifest.nodes) {
      setNode(selectedNode);
    } else {
      setNode(prev => (prev && prev in manifest.nodes ? prev : (nodeNames[0] ?? '')));
    }
    // Re-sync only when the nav-rail selection or the set of nodes changes, so a manual
    // pick in the Select below is not overridden on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode, nodeNames.length]);

  // Restore the saved test inputs for this connector (once per connector id). Saving
  // happens in the updateValue/updateMaxRows handlers, so this never clobbers fresh edits.
  // Secrets are filtered on the way in as well as on the way out: an earlier build wrote
  // them, and a parameter can be marked SECRET after its value was already stored.
  useEffect(() => {
    try {
      // Purge the shared bucket earlier builds wrote every unsaved draft into — it can
      // hold another connector's values, including ones since declared SECRET.
      localStorage.removeItem('connector-builder:test-settings:new');
      if (!storageKey) return;
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { values?: Record<string, string>; maxRows?: number };
      if (saved.values && typeof saved.values === 'object') {
        const restored = withoutSecrets(saved.values);
        setValues(restored);
      }
      if (typeof saved.maxRows === 'number') setMaxRows(saved.maxRows);
    } catch {
      /* ignore malformed storage */
    }
    // Re-runs only when the connector this dock belongs to changes; `withoutSecrets`
    // closes over the manifest and would otherwise re-restore on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const run = async () => {
    // Running a test should reveal its output: expand the (collapsed-by-default) dock.
    if (!open) onToggleOpen();
    setRunning(true);
    setResult(null);
    try {
      const res = await new ConnectorBuilderApiService().test({
        manifest,
        node,
        configuration: values,
        maxRows,
      });
      setResult(res);
      setSample(node, res.sample ?? []);
    } catch (e) {
      setResult({ rows: [], logs: [], error: testFailureMessage(e) });
    } finally {
      setRunning(false);
    }
  };

  const hasNodes = nodeNames.length > 0;
  const ok = result && !result.error;
  const headerRecords = result ? displayRecords(result) : [];
  const showingSample = result?.rows.length === 0 && (result.sample?.length ?? 0) > 0;
  // Hoisted so the "Fix with AI" handler keeps the narrowing: TypeScript drops
  // property narrowing inside a callback, but a const survives it.
  const resultError = result?.error;
  const resultLogs = result?.logs ?? [];

  return (
    <div className='bg-card relative flex-none border-t' data-testid='results-dock'>
      <div
        onMouseDown={startResize}
        role='separator'
        aria-orientation='horizontal'
        aria-label='Resize results'
        data-testid='dock-resize'
        className='group/resize absolute inset-x-0 -top-1.5 z-20 flex h-3 cursor-row-resize items-center justify-center'
      >
        <div className='bg-border group-hover/resize:bg-muted-foreground/60 h-1 w-10 rounded-full transition-colors' />
      </div>
      {/* Dock header */}
      <div className='flex items-center gap-3 px-6 py-[11px]'>
        <CirclePlay className='text-primary h-4 w-4 shrink-0' />
        <span className='text-foreground text-[13.5px] font-medium'>Test fetch</span>

        {result &&
          (ok ? (
            <>
              <span className='inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-[3px] text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'>
                <span className='h-1.5 w-1.5 rounded-full bg-[#22c55e]' />
                OK
              </span>
              <span className='text-muted-foreground text-xs'>
                {headerRecords.length} {headerRecords.length === 1 ? 'record' : 'records'}
                {showingSample ? ' · raw sample' : ''}
              </span>
            </>
          ) : (
            <span className='inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-[3px] text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400'>
              <span className='h-1.5 w-1.5 rounded-full bg-red-500' />
              Error
            </span>
          ))}

        {result && (
          <div
            className='ml-1 inline-flex rounded-md border p-0.5'
            role='tablist'
            aria-label='Result view'
          >
            {(
              [
                ['table', 'Table'],
                ['json', 'JSON'],
                ['logs', `Logs${result.logs.length ? ` (${result.logs.length})` : ''}`],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type='button'
                role='tab'
                aria-selected={view === v}
                data-testid={`view-${v}`}
                onClick={() => {
                  setView(v);
                }}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  view === v
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {resultError && onFixWithAi && (
          <Button
            variant='outline'
            size='sm'
            aria-label='Fix with AI'
            onClick={() => {
              onFixWithAi({ logs: resultLogs, error: resultError });
            }}
          >
            Fix with AI
          </Button>
        )}

        <div className='ml-auto flex items-center gap-2.5'>
          {hasNodes && (
            <Select value={node} onValueChange={setNode}>
              <SelectTrigger className='h-8 w-[120px] text-xs'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {nodeNames.map(n => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <button
            type='button'
            aria-label='Test settings'
            data-testid='test-settings-gear'
            onClick={() => {
              setSettings(true);
            }}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md border transition-colors',
              settings
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-accent'
            )}
          >
            <Settings className='h-4 w-4' />
          </button>

          <Button
            size='sm'
            onClick={() => void run()}
            disabled={running || !node}
            data-testid='run-test'
            className='h-8 gap-1.5'
          >
            <Play className='h-3.5 w-3.5' />
            {running ? 'Running…' : 'Run test'}
          </Button>

          <button
            type='button'
            aria-label={open ? 'Collapse results' : 'Expand results'}
            data-testid='open-dock'
            onClick={onToggleOpen}
            className='text-muted-foreground hover:bg-accent border-border flex h-8 w-8 items-center justify-center rounded-md border'
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', !open && 'rotate-180')} />
          </button>
        </div>
      </div>

      {open && (
        <div
          className='overflow-auto border-t'
          style={{ height: dockHeight }}
          data-testid='test-panel'
        >
          <DockBody result={result} hasNodes={hasNodes} view={view} />
        </div>
      )}

      <TestSettingsPanel
        open={settings}
        onOpenChange={setSettings}
        nodeNames={nodeNames}
        node={node}
        onNodeChange={setNode}
        paramEntries={paramEntries}
        values={values}
        onChangeValue={updateValue}
        maxRows={maxRows}
        onChangeMaxRows={updateMaxRows}
        onRun={() => {
          setSettings(false);
          void run();
        }}
        running={running}
      />
    </div>
  );
}

function DockBody({
  result,
  hasNodes,
  view,
}: {
  result: ConnectorTestResultDto | null;
  hasNodes: boolean;
  view: ResultView;
}) {
  if (!hasNodes) {
    return (
      <p className='text-muted-foreground p-6 text-sm'>Add a node first to test the connector.</p>
    );
  }
  if (!result) {
    return (
      <p className='text-muted-foreground p-6 text-sm'>
        Pick a node and run a test to see results here.
      </p>
    );
  }
  if (view === 'logs') return <LogsView logs={result.logs} />;
  if (view === 'json') return <JsonView result={result} />;
  return <TableView result={result} />;
}

/** Tabular view: the result grid (cast rows, or the raw sample for a fields-less node),
 * or an error/empty placeholder. */
function TableView({ result }: { result: ConnectorTestResultDto }) {
  if (result.error) {
    return (
      <div className='p-6 text-sm text-red-600 dark:text-red-400' data-testid='test-error'>
        {result.error}
      </div>
    );
  }
  const records = displayRecords(result);
  if (records.length === 0) {
    return (
      <p className='text-muted-foreground p-6 text-sm' data-testid='test-empty'>
        No rows returned. Open the Logs tab to see what the connector reported.
      </p>
    );
  }

  const { columns, primitive } = deriveColumns(records);
  return (
    <div data-testid='test-results' className='min-w-max'>
      <table className='w-full border-collapse text-[13px]'>
        <thead className='sticky top-0 z-10'>
          <tr className='bg-accent text-muted-foreground text-[11px] font-medium'>
            {columns.map((c, i) => (
              <th
                key={c}
                className={cn(
                  'border-border border-b py-2 text-left font-medium',
                  i === 0 ? 'pr-2 pl-6' : 'px-3'
                )}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((row, i) => (
            <tr key={i} className='border-border hover:bg-accent/60 border-b'>
              {columns.map((c, j) => (
                <td
                  key={c}
                  className={cn('max-w-[260px] py-2 align-middle', j === 0 ? 'pr-2 pl-6' : 'px-3')}
                >
                  {/* `row?.` for the null entries deriveColumns already allows for: the
                      dock has no error boundary of its own, so a throw here unmounts the
                      whole builder and the author's unsaved edits with it. */}
                  <Cell value={primitive ? (row as unknown) : row?.[c]} mono={j === 0} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** JSON view: the full, untruncated rows as pretty-printed JSON (wraps, never clips). */
function JsonView({ result }: { result: ConnectorTestResultDto }) {
  if (result.error) {
    return (
      <div className='p-6 text-sm text-red-600 dark:text-red-400' data-testid='test-error'>
        {result.error}
      </div>
    );
  }
  return (
    <pre
      data-testid='test-json'
      className='text-foreground p-6 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap'
    >
      {JSON.stringify(displayRecords(result), null, 2)}
    </pre>
  );
}

type LogLevel = 'error' | 'warn' | 'info' | 'trace' | 'control' | 'raw';
interface ParsedLog {
  time: string;
  level: LogLevel;
  label: string;
  message: string;
  raw: string;
}

const LOG_STYLES: Record<LogLevel, { chip: string; text: string }> = {
  error: {
    chip: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400',
    text: 'text-red-600 dark:text-red-400',
  },
  warn: {
    chip: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
    text: 'text-amber-700 dark:text-amber-400',
  },
  info: {
    chip: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    text: 'text-foreground',
  },
  trace: { chip: 'bg-accent text-muted-foreground', text: 'text-muted-foreground' },
  control: { chip: 'bg-accent text-muted-foreground', text: 'text-muted-foreground' },
  raw: { chip: 'bg-accent text-muted-foreground', text: 'text-muted-foreground' },
};

/** Parse one connector-event log line (JSON) into a level + short label + message.
 * Non-JSON lines fall back to a raw, muted row. */
function parseLog(line: string): ParsedLog {
  try {
    const o = JSON.parse(line) as Record<string, unknown>;
    const ts = typeof o.timestamp === 'string' ? o.timestamp : '';
    const time = ts.length >= 23 ? ts.slice(11, 23) : '';
    if (o.type === 'LOG') {
      const lvl = asText(o.level, 'info').toLowerCase();
      const level: LogLevel = lvl.startsWith('err')
        ? 'error'
        : lvl.startsWith('warn')
          ? 'warn'
          : 'info';
      return {
        time,
        level,
        label: level.toUpperCase(),
        message: asText(o.message),
        raw: line,
      };
    }
    if (o.type === 'CONTROL') {
      const action = asText(o.action);
      return {
        time,
        level: action === 'failed' ? 'error' : 'control',
        label: 'CTRL',
        message: action,
        raw: line,
      };
    }
    if (o.type === 'TRACE') {
      const action = asText(o.action);
      const details = (o.details ?? {}) as { url?: unknown };
      const url = typeof details.url === 'string' ? details.url : '';
      return {
        time,
        level: 'trace',
        label: 'TRACE',
        message: [action, url].filter(Boolean).join(' '),
        raw: line,
      };
    }
    const { type, timestamp, ...rest } = o;
    void timestamp;
    return {
      time,
      level: 'info',
      label: asText(type, 'LOG'),
      message: JSON.stringify(rest),
      raw: line,
    };
  } catch {
    return { time: '', level: 'raw', label: '', message: line, raw: line };
  }
}

/** Logs view: the connector run's events as an aligned, level-coloured grid
 * (its own tab now, so 0-row runs are still debuggable). */
function LogsView({ logs }: { logs: string[] }) {
  if (logs.length === 0) {
    return <p className='text-muted-foreground p-6 text-sm'>No logs for this run.</p>;
  }
  return (
    <div
      data-testid='test-logs'
      className='grid grid-cols-[auto_auto_1fr] items-baseline gap-x-2.5 gap-y-px p-6 font-mono text-[11.5px] leading-relaxed'
    >
      {logs.map((line, i) => {
        const p = parseLog(line);
        const s = LOG_STYLES[p.level];
        return (
          <Fragment key={i}>
            <span className='text-muted-foreground tabular-nums'>{p.time}</span>
            <span
              className={
                p.label
                  ? cn(
                      'justify-self-start rounded px-1 text-[10px] font-semibold uppercase',
                      s.chip
                    )
                  : ''
              }
            >
              {p.label}
            </span>
            <span className={cn('break-words whitespace-pre-wrap', s.text)} title={p.raw}>
              {p.message}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

/** Render a single result cell: arrays of primitives → info-blue chips; objects/arrays of
 * objects → mono raw-JSON; primitives → plain truncated text. */
function Cell({ value, mono }: { value: unknown; mono?: boolean }) {
  if (value === null || value === undefined) return null;

  if (Array.isArray(value) && value.every(v => typeof v !== 'object' || v === null)) {
    return (
      <span className='flex flex-wrap gap-1'>
        {value.map((v, i) => (
          <span
            key={i}
            className='rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
          >
            {String(v)}
          </span>
        ))}
      </span>
    );
  }

  // Checked positively rather than by elimination: `unknown` is not narrowed by
  // ruling typeof branches out, so only an explicit primitive test lets String()
  // be safe here. Everything else (objects, functions) takes the JSON popover.
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return (
      <span
        className={cn(
          'block truncate',
          mono ? 'text-muted-foreground font-mono' : 'text-foreground'
        )}
      >
        {String(value)}
      </span>
    );
  }

  return <JsonCell value={value as object} />;
}

/** An object/array cell: the value stays truncated in the row, but clicking it opens a
 * popover with the full, pretty-printed JSON (the table alone would otherwise clip it). */
function JsonCell({ value }: { value: object }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type='button'
          data-testid='json-cell'
          title='Click to view full JSON'
          className='text-muted-foreground hover:text-foreground block w-full max-w-[260px] cursor-pointer truncate text-left font-mono text-xs underline-offset-2 hover:underline'
        >
          {JSON.stringify(value)}
        </button>
      </PopoverTrigger>
      <PopoverContent align='start' className='max-h-80 w-[420px] overflow-auto p-0'>
        <pre className='text-foreground p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap'>
          {JSON.stringify(value, null, 2)}
        </pre>
      </PopoverContent>
    </Popover>
  );
}

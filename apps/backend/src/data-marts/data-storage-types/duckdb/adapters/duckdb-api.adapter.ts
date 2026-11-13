import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { DuckDBConnection, DuckDBPreparedStatement } from '@duckdb/node-api';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import {
  DuckDbFileBusyError,
  DuckDbLockRetryOptions,
  withDuckDbLockRetry,
} from '../utils/duckdb-lock-retry.utils';

// Data Mart SQL runs here: no host files and no extension installs. createHardenedInstance
// then locks the configuration, so no SET can undo them.
const HOST_ISOLATION_OPTIONS = {
  enable_external_access: 'false',
  autoinstall_known_extensions: 'false',
  autoload_known_extensions: 'false',
  allow_community_extensions: 'false',
};

// Leaves the rest of the host to the app and to loads: a quarter of the memory, half of the cores.
function resourceLimits() {
  const memory = Math.min(os.totalmem(), process.constrainedMemory() || Infinity);
  return {
    memory_limit: `${Math.max(256, Math.floor(memory / 4 / 1e6))}MB`,
    threads: String(Math.max(1, Math.floor(os.availableParallelism() / 2))),
    max_temp_directory_size: '10GB',
  };
}

type AccessMode = 'READ_ONLY' | 'READ_WRITE';
type DuckDbNodeApi = typeof import('@duckdb/node-api');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DuckDbInstance = any;

interface FileLease {
  instance: DuckDbInstance;
  release(): void;
}

interface FileUse {
  readers: number;
  readerInstance?: Promise<DuckDbInstance>;
  writing: boolean;
  writersWaiting: number;
}

// DuckDB's file lock belongs to the process: closing a second instance of a file drops it for both.
const fileUses = new Map<string, FileUse>();

function fileUse(filePath: string): FileUse {
  let use = fileUses.get(filePath);
  if (!use) fileUses.set(filePath, (use = { readers: 0, writing: false, writersWaiting: 0 }));
  return use;
}

function forgetIfIdle(filePath: string, use: FileUse): void {
  if (!use.writing && use.readers === 0 && use.writersWaiting === 0) fileUses.delete(filePath);
}

interface OpenFile {
  lease: FileLease;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connection: any;
  /** Ends the work started on the connection, e.g. interrupts and drains an unread stream. */
  settle?: () => Promise<void>;
}

// Settles before closing: a result not read to the end keeps the database, and its file lock, open.
async function closeFile(file: OpenFile): Promise<void> {
  try {
    await file.settle?.();
    file.connection.closeSync();
  } finally {
    file.lease.release();
  }
}

// A safety net: on GC, close the file of an adapter dropped without close().
const droppedAdapters = new FinalizationRegistry<OpenFile>(file => {
  // A rejection here would be unhandled; closeFile releases the lease even when closing throws.
  closeFile(file).catch(() => undefined);
});

const ADAPTER_CLOSED = 'DuckDB adapter is closed';

/**
 * An instance with the host isolation options and resource limits, whose session time zone is
 * UTC rather than the host's, and whose configuration is locked before anyone can use it.
 */
export async function createHardenedInstance(
  filePath: string,
  options: Record<string, string> = {}
): Promise<DuckDbInstance> {
  // Required lazily, so importing this module does not load the native binding.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const duck = require('@duckdb/node-api');
  const instance = await duck.DuckDBInstance.create(filePath, {
    ...options,
    ...resourceLimits(),
    ...HOST_ISOLATION_OPTIONS,
  });
  let connection: DuckDBConnection | undefined;
  try {
    connection = (await instance.connect()) as DuckDBConnection;
    // create() does not accept TimeZone, and lock_configuration would refuse a later SET.
    await connection.run(`SET GLOBAL TimeZone = 'UTC'`);
    await connection.run('SET GLOBAL lock_configuration = true');
    connection.closeSync();
  } catch (error) {
    for (const handle of [connection, instance]) {
      try {
        handle?.closeSync();
      } catch {
        // The setup error is the one to report.
      }
    }
    throw error;
  }
  return instance;
}

function openInstance(filePath: string, accessMode: AccessMode): Promise<DuckDbInstance> {
  if (accessMode === 'READ_WRITE') fs.mkdirSync(path.dirname(filePath), { recursive: true });
  return createHardenedInstance(filePath, { access_mode: accessMode });
}

/**
 * `sql` prepared with its LIST, STRUCT, MAP, ARRAY and UNION columns cast to VARCHAR, so readers
 * get the text DuckDB gives them, which is the text a filter on such a column (declared VARCHAR)
 * matches. SQL that cannot be wrapped, e.g. with a comment after its last `;`, is prepared as is.
 */
async function prepareCompositeColumnsAsText(
  connection: DuckDBConnection,
  sql: string
): Promise<DuckDBPreparedStatement> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DuckDBTypeId, StatementType }: DuckDbNodeApi = require('@duckdb/node-api');
  const composite = new Set([
    DuckDBTypeId.LIST,
    DuckDBTypeId.STRUCT,
    DuckDBTypeId.MAP,
    DuckDBTypeId.ARRAY,
    DuckDBTypeId.UNION,
  ]);
  const prepared = await connection.prepare(sql);
  try {
    const columns = Array.from({ length: prepared.columnCount }, (_, i) => ({
      name: prepared.columnName(i),
      cast: composite.has(prepared.columnTypeId(i)),
    }));
    if (prepared.statementType !== StatementType.SELECT || !columns.some(c => c.cast)) {
      return prepared;
    }
    const select = columns.map(({ name, cast }, i) => {
      const ref = `q."${i}"`;
      return `${cast ? `CAST(${ref} AS VARCHAR)` : ref} AS "${name.replace(/"/g, '""')}"`;
    });
    const aliases = columns.map((_, i) => `"${i}"`);
    const inner = sql.trim().replace(/;\s*$/, '');
    const wrapped = `SELECT ${select.join(', ')} FROM (\n${inner}\n) AS q(${aliases.join(', ')})`;
    const preparedWrapped = await connection.prepare(wrapped).catch(() => null);
    if (!preparedWrapped) return prepared;
    prepared.destroySync();
    return preparedWrapped;
  } catch (error) {
    prepared.destroySync();
    throw error;
  }
}

// withDuckDbLockRetry waits a refused lease out like another process's lock.
async function leaseFile(filePath: string, accessMode: AccessMode): Promise<FileLease> {
  const use = fileUse(filePath);
  const blocked = accessMode === 'READ_WRITE' ? use.readers > 0 : use.writersWaiting > 0;
  if (use.writing || blocked) {
    throw new DuckDbFileBusyError(
      `DuckDB file lock is held by another operation in this process: ${filePath}`
    );
  }

  if (accessMode === 'READ_WRITE') {
    use.writing = true;
    try {
      const instance = await openInstance(filePath, accessMode);
      return {
        instance,
        release: () => {
          try {
            instance.closeSync();
          } finally {
            use.writing = false;
            forgetIfIdle(filePath, use);
          }
        },
      };
    } catch (error) {
      use.writing = false;
      forgetIfIdle(filePath, use);
      throw error;
    }
  }

  if (!use.readerInstance && !fs.existsSync(filePath)) {
    // A read-only open cannot create the file: create an empty database before the first load.
    use.writing = true;
    try {
      (await openInstance(filePath, 'READ_WRITE')).closeSync();
    } catch (error) {
      use.writing = false;
      forgetIfIdle(filePath, use);
      throw error;
    }
    use.writing = false;
  }

  let opening: Promise<DuckDbInstance> | undefined;
  try {
    use.readers++;
    opening = use.readerInstance ??= openInstance(filePath, accessMode);
    const instance = await opening;
    return {
      instance,
      release: () => {
        if (--use.readers > 0) return;
        use.readerInstance = undefined;
        forgetIfIdle(filePath, use);
        instance.closeSync();
      },
    };
  } catch (error) {
    if (use.readerInstance === opening) use.readerInstance = undefined;
    use.readers--;
    forgetIfIdle(filePath, use);
    throw error;
  }
}

/**
 * A chunked cursor over a streaming DuckDB result. `fetchRows` pulls the next chunk's
 * rows lazily — the full result set is never materialized in memory — and returns
 * `null` once the result is exhausted.
 *
 * Row values are raw `DuckDBValue`s, NOT normalized here: BIGINT arrives as a JS
 * `bigint` primitive, DATE/TIMESTAMP/TIME arrive as `DuckDBDateValue`/
 * `DuckDBTimestampValue`/`DuckDBTimeValue` wrapper objects. Consumers (the DuckDB
 * report reader, the sql-run executor) normalize for the response payload via the
 * shared `serializeDuckDbValue` util.
 */
export interface DuckDbQueryStream {
  /** Column names of the result, in order. */
  readonly columnNames: string[];
  /** Next chunk's rows as name→value objects, or null when the result is exhausted. */
  fetchRows(): Promise<Record<string, unknown>[] | null>;
  close(): Promise<void>;
}

/** When to interrupt a streaming query. */
export interface DuckDbQueryLimits {
  /** Interrupts the query once it has run this long, until its result is read or closed. */
  timeoutMs?: number;
  /** Interrupts the query when it aborts. */
  signal?: AbortSignal;
}

/**
 * Adapter for a DuckDB database file: read-only introspection/querying, and
 * (when opened with `accessMode: 'READ_WRITE'`) side-effecting DDL/DML via
 * {@link runStatement}.
 *
 * Not `@Injectable` — minted per-call by {@link DuckDbApiAdapterFactory}. Owns
 * its connection; MUST be closed by the caller (`finally`). A closed adapter refuses further use.
 *
 * DuckDB is single-writer-per-file: while another OS process (e.g. the connector-runner
 * child process during a load) holds the file open READ_WRITE, ANY other-process open —
 * including a READ_ONLY one — conflicts and throws. {@link conn} retries that conflict
 * uniformly for every caller (`introspectColumns`, `streamQuery`, `runStatement` all open
 * lazily through it), so every read path rides out a concurrent load, not just writers.
 */
export class DuckDbApiAdapter {
  private opened: Promise<OpenFile> | null = null;
  private closed = false;

  constructor(
    private readonly databasePath: string,
    private readonly accessMode: AccessMode = 'READ_ONLY',
    private readonly lockRetryOptions: DuckDbLockRetryOptions = {}
  ) {}

  /**
   * Lazily opens the database (memoizing the connection for subsequent calls), retrying the
   * open with {@link withDuckDbLockRetry} when it fails on a lock conflict.
   *
   * Only a SUCCESSFUL open is memoized: a rejected attempt is cleared, so a later `conn()`
   * gets a fresh attempt and `close()` stays a clean no-op. An open that finishes after
   * `close()` closes what it opened and rejects.
   */
  private async conn(): Promise<OpenFile> {
    if (this.closed) throw new Error(ADAPTER_CLOSED);
    if (!this.opened) {
      const filePath = path.resolve(this.databasePath);
      const opening = this.lease(filePath).then(async lease => {
        try {
          if (this.closed) throw new Error(ADAPTER_CLOSED);
          const connection = await lease.instance.connect();
          if (this.closed) {
            connection.closeSync();
            throw new Error(ADAPTER_CLOSED);
          }
          const file: OpenFile = { lease, connection };
          droppedAdapters.register(this, file, this);
          return file;
        } catch (error) {
          lease.release();
          throw error;
        }
      });
      this.opened = opening;
      opening.catch(() => {
        if (this.opened === opening) this.opened = null;
      });
    }
    const file = await this.opened;
    // close() ran meanwhile and closes the file itself.
    if (this.closed) throw new Error(ADAPTER_CLOSED);
    return file;
  }

  // A waiting writer turns new readers away, so a steady stream of reads cannot starve it.
  private async lease(filePath: string): Promise<FileLease> {
    const lease = () =>
      withDuckDbLockRetry(() => leaseFile(filePath, this.accessMode), this.lockRetryOptions);
    if (this.accessMode === 'READ_ONLY') return lease();
    const use = fileUse(filePath);
    use.writersWaiting++;
    try {
      return await lease();
    } finally {
      use.writersWaiting--;
      forgetIfIdle(filePath, use);
    }
  }

  private async connFor(sql: string): Promise<OpenFile> {
    const file = await this.conn();
    const parsing = file.connection.extractStatements(sql);
    // close() waits for the parse rather than closing the connection under it.
    file.settle = () =>
      parsing.then(
        () => undefined,
        () => undefined
      );
    const statements = await parsing.catch(error => {
      if (error instanceof Error) {
        error.message = error.message.replace(/^Failed to extract statements: /, '');
      }
      throw error;
    });
    if (this.closed) throw new Error(ADAPTER_CLOSED);
    // A second statement would run with the first one's access, e.g. a DROP after a view's DDL.
    if (statements.count !== 1) {
      throw new BusinessViolationException('Only one SQL statement is allowed');
    }
    return file;
  }

  /**
   * Introspects column names/types for a schema-qualified table via
   * `information_schema.columns`. Schema/table values are single-quote-escaped
   * before interpolation (they are literals in a `WHERE ... = '...'` clause,
   * not identifiers).
   *
   * @param schema - schema name (e.g. `main`)
   * @param table - table name
   */
  async introspectColumns(
    schema: string,
    table: string
  ): Promise<Array<{ name: string; type: string }>> {
    const { connection } = await this.conn();
    const esc = (s: string) => String(s).replace(/'/g, "''");
    const sql =
      `SELECT column_name, data_type FROM information_schema.columns ` +
      `WHERE table_schema = '${esc(schema)}' AND table_name = '${esc(table)}' ORDER BY ordinal_position`;
    const reader = await connection.runAndReadAll(sql);
    return (
      reader
        .getRowObjects()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => ({ name: String(r.column_name), type: String(r.data_type) }))
    );
  }

  /** The result columns of `sql` without running it (DuckDB `DESCRIBE <query>`). */
  async describeQuery(sql: string): Promise<Array<{ name: string; type: string }>> {
    const describe = `DESCRIBE ${sql}`;
    const { connection } = await this.connFor(describe);
    const reader = await connection.runAndReadAll(describe);
    return (
      reader
        .getRowObjects()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => ({ name: String(r.column_name), type: String(r.column_type) }))
    );
  }

  /**
   * Runs `sql` as a STREAMING query and returns a chunked cursor over the result.
   * NEVER materializes the whole result set — `fetchRows` pulls one chunk at a time
   * via the underlying `DuckDBResult`, so memory stays bounded regardless of result size.
   * `limits` interrupt the query on a timeout or an abort; the pending call then rejects.
   *
   * Verified against the installed `@duckdb/node-api` surface: `prepared.stream()`
   * resolves a streaming `DuckDBResult` exposing `columnNames()` (sync) and
   * `fetchChunk()` (async, returns the next `DuckDBDataChunk | null`); a chunk exposes
   * `rowCount` and the synchronous `getRowObjects(columnNames)`.
   */
  async streamQuery(sql: string, limits: DuckDbQueryLimits = {}): Promise<DuckDbQueryStream> {
    limits.signal?.throwIfAborted();
    const file = await this.connFor(sql);
    // The lock wait can outlast the caller; an abort listener added now would never fire.
    limits.signal?.throwIfAborted();
    const { connection } = file;
    let interrupted = false;
    const interrupt = () => {
      interrupted = true;
      connection.interrupt();
    };
    const timer =
      limits.timeoutMs === undefined ? undefined : setTimeout(interrupt, limits.timeoutMs);
    limits.signal?.addEventListener('abort', interrupt, { once: true });
    let finished = false;
    const stop = () => {
      finished = true;
      clearTimeout(timer);
      limits.signal?.removeEventListener('abort', interrupt);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const starting: Promise<any> = prepareCompositeColumnsAsText(connection, sql).then(
      async prepared => {
        try {
          // DuckDB forgets an interrupt that comes before its query starts, e.g. during the prepares.
          if (interrupted) throw new Error('INTERRUPT Error: Interrupted before the query started');
          return await prepared.stream(); // rows fetched lazily per chunk
        } finally {
          prepared.destroySync();
        }
      }
    );
    // No `this` in these closures: the GC registry holds them and must not keep the adapter alive.
    const finish = async (): Promise<void> => {
      if (finished) return;
      stop();
      interrupt();
      const result = await starting.catch(() => null);
      while ((await result?.fetchChunk().catch(() => null))?.rowCount) continue;
    };
    file.settle = finish;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any;
    try {
      result = await starting;
    } catch (error) {
      stop();
      throw error;
    }
    // close() ran meanwhile: it interrupts and drains the result through `finish`.
    if (this.closed) throw new Error(ADAPTER_CLOSED);
    const columnNames: string[] = result.columnNames();
    return {
      columnNames,
      async fetchRows(): Promise<Record<string, unknown>[] | null> {
        const chunk = await result.fetchChunk();
        if (!chunk || chunk.rowCount === 0) {
          stop();
          return null;
        }
        // Synchronous on DuckDBDataChunk; returns DuckDBValue[] per column, raw/unnormalized.
        return chunk.getRowObjects(columnNames);
      },
      close: finish,
    };
  }

  /** Executes a single side-effecting statement (DDL/DML) on the connection. */
  async runStatement(sql: string): Promise<void> {
    const { connection } = await this.connFor(sql);
    await connection.run(sql); // DuckDBConnection.run executes without materializing a reader
  }

  /** Closes the connection and releases this adapter's use of the file. Safe to call multiple times. */
  async close(): Promise<void> {
    this.closed = true;
    const opening = this.opened;
    if (!opening) return;
    this.opened = null;
    // Tolerate a rejected open (e.g. a WRITE open that lost the lock): there is nothing to close.
    const file = await opening.catch(() => null);
    if (!file) return;
    droppedAdapters.unregister(this);
    // A successful open whose close throws is a real signal (handle/lock leak) — let it propagate.
    await closeFile(file);
  }
}

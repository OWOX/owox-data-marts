import { OWOXApiError, OWOXAuthError } from './errors.js';

export type JsonRequester = {
  getJson<T>(path: string, query?: Record<string, string>): Promise<T>;
  getStream(path: string, query?: URLSearchParams): Promise<Response>;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function withSourceContext(error: OWOXApiError, idKey: string, id: string): OWOXApiError {
  const details = isRecord(error.details)
    ? { [idKey]: id, ...error.details }
    : {
        [idKey]: id,
        ...(error.details === undefined ? {} : { details: error.details }),
      };
  const ErrorClass = error instanceof OWOXAuthError ? OWOXAuthError : OWOXApiError;

  return new ErrorClass(error.message, {
    status: error.status,
    code: error.code,
    details,
    cause: error,
  });
}

export type TraversalSource = {
  /** Key used for this source's id in `error.details`, e.g. "dataMartId" or "reportId". */
  idKey: string;
  /** Human-readable label used in stream error messages, e.g. "OWOX Data Mart" or "OWOX report". */
  label: string;
};

export class HttpNdjsonTraversal {
  readonly runId: string | undefined;
  private consumed = false;
  private cancelled = false;

  constructor(
    private readonly response: Response,
    private readonly sourceId: string,
    private readonly source: TraversalSource
  ) {
    this.runId = response.headers.get('x-owox-run-id') ?? undefined;
  }

  async cancel(): Promise<void> {
    if (this.consumed || this.cancelled) {
      return;
    }

    this.cancelled = true;
    await this.response.body?.cancel().catch(() => undefined);
  }

  async *rowChunks(): AsyncIterable<Record<string, unknown>[]> {
    if (this.consumed || this.cancelled) {
      throw new OWOXApiError(`${this.source.label} data stream can only be traversed once`, {
        details: this.contextDetails(),
      });
    }
    this.consumed = true;

    if (!this.response.body) {
      throw new OWOXApiError(`${this.source.label} data stream response did not include a body`, {
        details: this.contextDetails(),
      });
    }

    const reader = this.response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let lineNumber = 0;
    let streamEnded = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        streamEnded = done;
        pending += decoder.decode(value, { stream: !done });

        const lines = pending.split('\n');
        pending = lines.pop() ?? '';

        const rows: Record<string, unknown>[] = [];
        for (const line of lines) {
          if (line.length === 0) {
            continue;
          }
          lineNumber += 1;
          rows.push(this.parseLine(line, lineNumber));
        }

        if (rows.length > 0) {
          yield rows;
        }

        if (done) {
          break;
        }
      }

      if (pending.length > 0) {
        lineNumber += 1;
        yield [this.parseLine(pending, lineNumber)];
      }
    } catch (error) {
      if (error instanceof OWOXApiError) {
        throw error;
      }

      throw new OWOXApiError(`Failed to read ${this.source.label} data stream`, {
        details: this.contextDetails(),
        cause: error,
      });
    } finally {
      if (!streamEnded) {
        await reader.cancel().catch(() => undefined);
      }
      reader.releaseLock();
    }
  }

  private parseLine(line: string, lineNumber: number): Record<string, unknown> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new OWOXApiError(
        `Malformed NDJSON line ${lineNumber} in ${this.source.label} data stream`,
        {
          details: {
            ...this.contextDetails(),
            lineNumber,
            linePreview: line.slice(0, 200),
          },
          cause: error,
        }
      );
    }

    if (!isRecord(parsed)) {
      throw new OWOXApiError(`NDJSON line ${lineNumber} is not a JSON object`, {
        details: {
          ...this.contextDetails(),
          lineNumber,
        },
      });
    }

    return parsed;
  }

  private contextDetails(): Record<string, string> {
    return {
      [this.source.idKey]: this.sourceId,
      ...(this.runId ? { runId: this.runId } : {}),
    };
  }
}

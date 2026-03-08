export interface MeasuredExecutionBaseResult {
  status: 'ok' | 'failed';
  start: number;
  end: number;
  executionTimeMs: number;
}

export interface MeasuredExecutionSuccessResult<T> extends MeasuredExecutionBaseResult {
  status: 'ok';
  result: T;
}

export interface MeasuredExecutionFailedResult extends MeasuredExecutionBaseResult {
  status: 'failed';
}

export type MeasuredExecutionResult<T> =
  | MeasuredExecutionSuccessResult<T>
  | MeasuredExecutionFailedResult;

interface MeasureExecutionTimeOptions<T> {
  onMeasured?: (measured: MeasuredExecutionResult<T>) => void;
  now?: () => number;
}

export async function measureExecutionTime<T>(
  callable: () => Promise<T> | T,
  options?: MeasureExecutionTimeOptions<T>
): Promise<MeasuredExecutionSuccessResult<T>> {
  const now = options?.now ?? Date.now;
  const start = now();

  try {
    const result = await callable();
    const end = now();
    const executionTimeMs = Math.max(0, end - start);
    const measured: MeasuredExecutionSuccessResult<T> = {
      status: 'ok',
      start,
      end,
      executionTimeMs,
      result,
    };
    options?.onMeasured?.(measured);

    return measured;
  } catch (error) {
    const end = now();
    const executionTimeMs = Math.max(0, end - start);
    const measured: MeasuredExecutionFailedResult = {
      status: 'failed',
      start,
      end,
      executionTimeMs,
    };
    options?.onMeasured?.(measured);

    throw error;
  }
}

export function toMeasuredExecutionBaseResult(
  measured: MeasuredExecutionResult<unknown>
): MeasuredExecutionBaseResult {
  return {
    status: measured.status,
    start: measured.start,
    end: measured.end,
    executionTimeMs: measured.executionTimeMs,
  };
}

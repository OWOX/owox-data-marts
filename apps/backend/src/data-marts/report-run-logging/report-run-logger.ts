import { SystemTimeService } from '../../common/scheduler/services/system-time.service';

export interface ReportRunLogger {
  log(message: Record<string, unknown> | string): void;
  error(error: unknown): void;
  asArrays(): { logs: string[]; errors: string[] };
}

function serializeLog(
  clock: SystemTimeService,
  payload: unknown,
  type: 'log' | 'error' = 'log'
): string {
  if (type === 'error') {
    const msg = payload instanceof Error ? payload.message : String(payload);
    return JSON.stringify({ type, at: clock.now(), error: msg });
  }
  if (typeof payload === 'string') {
    return JSON.stringify({ type, at: clock.now(), message: payload });
  }
  return JSON.stringify({ type, at: clock.now(), ...(payload as Record<string, unknown>) });
}

export function createReportRunLogger(clock: SystemTimeService): ReportRunLogger {
  const logs: string[] = [];
  const errors: string[] = [];

  return {
    log(message: Record<string, unknown> | string) {
      logs.push(serializeLog(clock, message, 'log'));
    },
    error(error: unknown) {
      errors.push(serializeLog(clock, error, 'error'));
    },
    asArrays() {
      return { logs: [...logs], errors: [...errors] };
    },
  };
}

export interface ReportRunExecutionContext {
  runId: string;
  logger: ReportRunLogger;
}

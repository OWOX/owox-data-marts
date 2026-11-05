import { Logger } from '@nestjs/common';
import { castError } from '@owox/internal-helpers';

const logger = new Logger('McpTool');

export function logMcpToolError(error: unknown, operation: string): void {
  const normalized = castError(error);
  // Messages can span lines and contain provider secrets. Keep only stack frames.
  const frames = normalized.stack
    ?.replace(normalized.message, '')
    .split('\n')
    .filter(line => /^\s+at /.test(line))
    .join('\n');
  logger.error(`${operation} failed (${normalized.constructor.name}).`, frames ?? '');
}

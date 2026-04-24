import { BlendingDecision } from '../dto/domain/blending-decision.dto';
import { ReportRunLogger } from './report-run-logger';

export function logBlendedSqlIfNeeded(decision: BlendingDecision, logger?: ReportRunLogger): void {
  if (!logger || !decision.needsBlending || !decision.blendedSql) {
    return;
  }
  logger.log({
    type: 'joined-data-marts-sql',
    message: 'SQL over joined Data Marts used for report execution',
    sql: decision.blendedSql,
  });
}

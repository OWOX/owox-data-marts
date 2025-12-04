import { ToolMessageProcessor } from '../../../common/ai-insights/agent/types';
import { SqlExecuteOutput, SqlExecuteOutputSchema } from '../ai-insights-types';

const DEFAULT_MAX_CHARS = 2000;
const DEFAULT_MIN_ROWS_IF_TRUNCATED = 3;

export function buildSqlExecuteMessageProcessor(params?: {
  maxCharsLimit?: number;
  reducedRowsCount?: number;
}): ToolMessageProcessor {
  const maxCharsLimit = params?.maxCharsLimit ?? DEFAULT_MAX_CHARS;
  const reducedRowsCount = params?.reducedRowsCount ?? DEFAULT_MIN_ROWS_IF_TRUNCATED;

  return ({ toolName, toolResult }) => {
    const parsed: SqlExecuteOutput = SqlExecuteOutputSchema.parse(toolResult.content);

    const fullJson = JSON.stringify(parsed);

    if (fullJson.length <= maxCharsLimit) {
      return fullJson;
    }

    const limitedRows = parsed.rows.slice(0, reducedRowsCount);

    const truncatedPayload = {
      tool: toolName,
      data: {
        columns: parsed.columns,
        rows: limitedRows,
      },
      meta: {
        totalRows: parsed.rows.length,
        shownRows: limitedRows.length,
        rowsTruncated: true,
        note: `Dataset truncated to ${limitedRows.length} rows to avoid overflowing model context.`,
      },
    };

    return JSON.stringify(truncatedPayload);
  };
}
